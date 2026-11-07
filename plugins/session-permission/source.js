import { name, inject, apply } from "./index.js";

export const selectorSource = `export const name = ${JSON.stringify(name)};
export const inject = ${JSON.stringify(inject)};
export const apply = ${apply.toString()};
`;
