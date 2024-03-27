/**
 * Cherry-picked Shoelace components
 * https://shoelace.style
 */
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";

import "@shoelace-style/shoelace/dist/themes/light.css";
import "@shoelace-style/shoelace/dist/components/alert/alert";
import "@shoelace-style/shoelace/dist/components/button/button";
import "@shoelace-style/shoelace/dist/components/icon/icon";
import "@shoelace-style/shoelace/dist/components/input/input";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox";
import "@shoelace-style/shoelace/dist/components/details/details";
import "@shoelace-style/shoelace/dist/components/button-group/button-group";
import "@shoelace-style/shoelace/dist/components/image-comparer/image-comparer";
import "@shoelace-style/shoelace/dist/components/radio/radio";
import "@shoelace-style/shoelace/dist/components/radio-group/radio-group";
import "@shoelace-style/shoelace/dist/components/radio-button/radio-button";
import "@shoelace-style/shoelace/dist/components/resize-observer/resize-observer";
import "@shoelace-style/shoelace/dist/components/select/select";
import "@shoelace-style/shoelace/dist/components/option/option";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown";
import "@shoelace-style/shoelace/dist/components/switch/switch";
import "@shoelace-style/shoelace/dist/components/textarea/textarea";
import "@shoelace-style/shoelace/dist/components/mutation-observer/mutation-observer";
import "@shoelace-style/shoelace/dist/components/progress-bar/progress-bar";

import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/dialog/dialog"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/divider/divider"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/format-bytes/format-bytes"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/format-date/format-date"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu/menu"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu-item/menu-item"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu-label/menu-label"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/relative-time/relative-time"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/skeleton/skeleton"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/spinner/spinner"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab/tab"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-group/tab-group"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tooltip/tooltip"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/popup/popup"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tree/tree"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tree-item/tree-item"
);

setBasePath("/shoelace");
registerIconLibrary("app", {
  resolver: (name) => `/assets/icons/${name}.svg`,
});
