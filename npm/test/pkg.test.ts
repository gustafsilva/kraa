import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPackageJson } from "../src/pkg";

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));

describe("readPackageJson", () => {
  it("lê o package.json do pacote", () => {
    expect(readPackageJson().version).toBe(pkg.version);
  });
});
