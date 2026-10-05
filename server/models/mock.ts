// MockModel: the free default model. It streams the pre-written screens in fixtures/ (see
// FixtureModel, which holds the routing and timing and also runs in the hosted playground).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FixtureModel, type FixtureModelOptions } from "./fixtureModel";

export interface MockModelOptions extends Omit<FixtureModelOptions, "read"> {
  /** Directory holding the .omni fixtures. Defaults to ./fixtures. */
  fixturesDir?: string;
}

export class MockModel extends FixtureModel {
  constructor({ fixturesDir = resolve("fixtures"), ...options }: MockModelOptions = {}) {
    super({ ...options, read: (id) => readFileSync(join(fixturesDir, `${id}.omni`), "utf8") });
  }
}
