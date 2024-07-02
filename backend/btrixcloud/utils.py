""" k8s utils """

import asyncio
import atexit
import csv
import io
import json
import signal
import os
import sys
import re

from datetime import datetime
from typing import Optional, Dict, Union, List, Any
from uuid import UUID

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from slugify import slugify


class JSONSerializer(json.JSONEncoder):
    """Serializer class for json.dumps with UUID and datetime support"""

    def default(self, o: Any) -> str:
        """JSON serialization conversion function."""

        if isinstance(o, UUID):
            return str(o)

        if isinstance(o, datetime):
            return o.isoformat()

        return super().default(o)


def get_templates_dir():
    """return directory containing templates for loading"""
    return os.path.join(os.path.dirname(__file__), "templates")


def from_k8s_date(string):
    """convert k8s date string to datetime"""
    return datetime.fromisoformat(string[:-1]) if string else None


def to_k8s_date(dt_val):
    """convert datetime to string for k8s"""
    return dt_val.isoformat("T") + "Z"


def dt_now():
    """get current ts"""
    return datetime.utcnow().replace(microsecond=0, tzinfo=None)


def ts_now():
    """get current ts"""
    return str(dt_now())


def run_once_lock(name):
    """run once lock via temp directory
    - if dir doesn't exist, return true
    - if exists, return false"""
    lock_dir = "/tmp/." + name
    try:
        os.mkdir(lock_dir)
    # pylint: disable=bare-except
    except:
        return False

    # just in case, delete dir on exit
    def del_dir():
        print("release lock: " + lock_dir, flush=True)
        os.rmdir(lock_dir)

    atexit.register(del_dir)
    return True


def register_exit_handler():
    """register exit handler to exit on SIGTERM"""
    loop = asyncio.get_running_loop()

    def exit_handler():
        """sigterm handler"""
        print("SIGTERM received, exiting")
        sys.exit(1)

    loop.add_signal_handler(signal.SIGTERM, exit_handler)


def parse_jsonl_error_messages(errors):
    """parse json-l error strings from redis/db into json"""
    parsed_errors = []
    for error_line in errors:
        if not error_line:
            continue
        try:
            result = json.loads(error_line)
            parsed_errors.append(result)
        except json.JSONDecodeError as err:
            print(
                f"Error decoding json-l error line: {error_line}. Error: {err}",
                flush=True,
            )
    return parsed_errors


def is_bool(stri: Optional[str]) -> bool:
    """Check if the string parameter is stringly true"""
    if stri:
        return stri.lower() in ("true", "1", "yes", "on")
    return False


def is_falsy_bool(stri: Optional[str]) -> bool:
    """Check if the string parameter is stringly false"""
    if stri:
        return stri.lower() in ("false", "0", "no", "off")
    return False


def str_list_to_bools(str_list: List[str], allow_none=True) -> List[Union[bool, None]]:
    """Return version of input string list cast to bool or None, ignoring other values"""
    output: List[Union[bool, None]] = []
    for val in str_list:
        if is_bool(val):
            output.append(True)
        if is_falsy_bool(val):
            output.append(False)
        if val.lower() in ("none", "null") and allow_none:
            output.append(None)
    return output


def slug_from_name(name: str) -> str:
    """Generate slug from name"""
    return slugify(name.replace("'", ""))


def validate_slug(slug: str) -> None:
    """Validate org slug, raise HTTPException if invalid

    Slugs must contain alphanumeric characters and dashes (-) only.
    """
    if re.match(r"^[\w-]+$", slug) is None:
        raise HTTPException(status_code=400, detail="invalid_slug")


def stream_dict_list_as_csv(data: List[Dict[str, Union[str, int]]], filename: str):
    """Stream list of dictionaries as CSV with attachment filename header"""
    if not data:
        raise HTTPException(status_code=404, detail="crawls_not_found")

    keys = data[0].keys()

    buffer = io.StringIO()
    dict_writer = csv.DictWriter(buffer, keys, quoting=csv.QUOTE_NONNUMERIC)
    dict_writer.writeheader()
    dict_writer.writerows(data)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"},
    )
