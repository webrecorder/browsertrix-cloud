import queryString from "query-string";
import UrlPattern from "url-pattern";

type Routes = { [key: string]: UrlPattern };
type Paths = { [key: string]: string };

export type ViewState = {
  // route name, e.g. "home"
  route: string | null;
  // path name
  // e.g. "/dashboard"
  // e.g. "/users/abc123"
  pathname: string;
  // params from URL (:) or query (?)
  // e.g. "/users/:id"
  // e.g. "/redirect?url"
  params: { [key: string]: string };
  // arbitrary data to pass between routes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { [key: string]: any };
};

export default class APIRouter {
  private readonly routes: Routes;

  constructor(paths: Paths) {
    this.routes = {};

    for (const [name, route] of Object.entries(paths)) {
      this.routes[name] = new UrlPattern(route);
    }
  }

  match(relativePath: string): ViewState {
    for (const [name, pattern] of Object.entries(this.routes)) {
      const [path, qs = ""] = relativePath.split("?");
      const match = pattern.match(path);

      if (match) {
        const queryParams = queryString.parse(qs, {
          // Only decode if needed, or else `+` in invite emails
          // may be incorrectly decoded
          decode: qs.includes("%"),
        });
        const params = {
          ...match,
          ...queryParams,
        };
        return { route: name, pathname: relativePath, params };
      }
    }

    return { route: null, pathname: relativePath, params: {} };
  }
}
