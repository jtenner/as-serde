import { instantiateSync } from "@assemblyscript/loader";
import fs from "fs";

const run = instantiateSync(fs.readFileSync("./build/untouched.wasm"), {});

run.exports._start();
