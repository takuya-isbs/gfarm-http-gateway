const fs = require("fs");

const OUTPUT_PREFIX = "GFARM_HTTP_API_REQUEST ";

class OpenAPICoverageReporter {
    constructor() {
        this.pendingOutput = "";
        this.requests = new Set();
    }

    onStdOut(chunk) {
        this.pendingOutput += chunk.toString();
        const lines = this.pendingOutput.split("\n");
        this.pendingOutput = lines.pop();
        for (const line of lines) this.collect(line);
    }

    onEnd() {
        if (this.pendingOutput) this.collect(this.pendingOutput);
        const outputFile = process.env.GFARM_HTTP_API_COVERAGE_FILE;
        if (outputFile && this.requests.size > 0) {
            fs.appendFileSync(outputFile, `${[...this.requests].join("\n")}\n`);
        }
    }

    collect(line) {
        const prefixIndex = line.indexOf(OUTPUT_PREFIX);
        if (prefixIndex < 0) return;
        const request = JSON.parse(line.slice(prefixIndex + OUTPUT_PREFIX.length));
        this.requests.add(JSON.stringify(request));
    }
}

module.exports = OpenAPICoverageReporter;
