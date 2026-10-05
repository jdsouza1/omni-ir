/// <reference types="vite/client" />
// The hosted playground's API: the free mock model and the stub tools, running in the browser,
// with every fixture bundled in. Used only by the static build (`npm run playground:static`).
import { createInBrowserApi } from "../server/inBrowser";
import { FixtureModel } from "../server/models/fixtureModel";

const files = import.meta.glob<string>("../fixtures/**/*.omni", { query: "?raw", import: "default", eager: true });
const FIXTURES = new Map(Object.entries(files).map(([path, text]) => [path.replace(/^\.\.\/fixtures\//, "").replace(/\.omni$/, ""), text]));

export function createPlaygroundFetch(speed: "instant" | "realistic" = "realistic") {
  return createInBrowserApi({
    model: new FixtureModel({
      speed,
      read: (id) => {
        const text = FIXTURES.get(id);
        if (text === undefined) throw new Error(`No fixture "${id}"`);
        return text;
      },
    }),
  });
}

export const inBrowserFetch = createPlaygroundFetch();
