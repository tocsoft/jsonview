const fs = require('fs');
const ts = require('typescript');
var glob = new (require("glob-fs"))();
const path = require('path');
const rollup = require('rollup');
const zip = require('adm-zip');

function reportDiagnostics(diagnostics) {
    diagnostics.forEach(diagnostic => {
        let message = "Error";
        if (diagnostic.file) {
            let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            message += ` ${diagnostic.file.fileName} (${line + 1},${character + 1})`;
        }
        message += ": " + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.log(message);
    });
}

function readConfigFile(configFileName) {
    // Read config file
    const configFileText = fs.readFileSync(configFileName).toString();

    // Parse JSON, after removing comments. Just fancier JSON.parse
    const result = ts.parseConfigFileTextToJson(configFileName, configFileText);
    const configObject = result.config;
    if (!configObject) {
        reportDiagnostics([result.error]);
        throw new Error("Failed to compile typescript");
    }

    // Extract config infromation
    const configParseResult = ts.parseJsonConfigFileContent(configObject, ts.sys, path.dirname(configFileName));
    if (configParseResult.errors.length > 0) {
        reportDiagnostics(configParseResult.errors);
        throw new Error("Failed to compile typescript");
    }
    return configParseResult;
}

function compile(configFileName) {
    // Extract configuration from config file
    let config = readConfigFile(configFileName);

    // Compile
    let program = ts.createProgram(config.fileNames, config.options);
    let emitResult = program.emit();

    // Report errors
    reportDiagnostics(ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics));

    // Return code
    if (emitResult.emitSkipped) {
        throw new Error("Failed to compile typescript");
    }
}

async function rollupCode(filename)
{
    var buildResult = await rollup.rollup({
        input: `ts-out/${filename}`,
    });
    await buildResult.write({
        format: "iife",
        name: "background",
        file: `build/${filename}`
    })
}

async function run() {
    compile("tsconfig.json");

    fs.rmSync("build", { force: true, recursive: true });
    fs.mkdirSync("build");

    await rollupCode("background.js");
    await rollupCode("content.js");
    await rollupCode("viewer.js");

    fs.copyFileSync("src/viewer.css", "build/viewer.css");
    fs.copyFileSync("src/manifest.json", "build/manifest.json");
    fs.copyFileSync("license.txt", "build/license.txt");
    fs.cpSync("src/_locales", "build/_locales", { recursive: true });

    var files = glob.readdirSync("src/icon*.png");
    files.forEach(f => {
        var filename = path.basename(f);
        fs.copyFileSync(f, "build/" + filename);
    })

    fs.rmSync("jsonview.zip", { force: true });

    var zipFile = new zip();

    zipFile.addLocalFolder("build", "");
    zipFile.writeZip("./jsonview.zip");
}

run();