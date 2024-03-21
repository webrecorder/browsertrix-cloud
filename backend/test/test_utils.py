"""utils tests"""

import pytest

from btrixcloud.utils import slug_from_name


@pytest.mark.parametrize(
    "name,expected_slug",
    [
        ("Default org", "default-org"),
        ("User's org", "users-org"),
        ("User's @ org", "users-org"),
        ("Org with åccénted charactêrs", "org-with-accented-characters"),
        ("Org with åccénted! charactêrs@!", "org-with-accented-characters"),
        ("cATs! 🐈🐈‍⬛", "cats"),
    ],
)
def test_slug_from_name(name: str, expected_slug: str):
    assert slug_from_name(name) == expected_slug
