import { attach, apply, inject, name } from "./index.js";

export const steeringSource = `import { Socket } from "node:net";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
export const name = ${JSON.stringify(name)};
export const inject = ${JSON.stringify(inject)};
export const attach = ${attach.toString()};
export const apply = ${apply.toString()};
`;
