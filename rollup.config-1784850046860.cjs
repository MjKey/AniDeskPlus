'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var svelte = require('rollup-plugin-svelte');
var commonjs = require('@rollup/plugin-commonjs');
var resolve = require('@rollup/plugin-node-resolve');
var livereload = require('rollup-plugin-livereload');
var terser = require('@rollup/plugin-terser');
var css = require('rollup-plugin-css-only');
var child_process = require('child_process');
var rollupPluginString = require('rollup-plugin-string');
var svgo = require('rollup-plugin-svgo');
var fs = require('fs');
var path = require('path');
var os = require('os');

const production = !process.env.ROLLUP_WATCH;
const fastBuild = process.env.FAST_BUILD === 'true';

function loadEnv() {
    const envPath = path.resolve(__dirname, '.env');
    const env = {};
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.slice(0, idx).trim();
                let val = trimmed.slice(idx + 1).trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                env[key] = val;
            }
        }
    }
    return env;
}

const envVars = loadEnv();

function envPlugin() {
    return {
        name: 'env-replace',
        transform(code, id) {
            if (!id.includes('node_modules')) {
                let replaced = code
                    .replace(/__ENV_SHIKIMORI_CLIENT_ID__/g, JSON.stringify(envVars.SHIKIMORI_CLIENT_ID || 'NeE3caFFa6Q-JLg0rAVxGTcsGwy12Btc2zYNuGolybY'))
                    .replace(/__ENV_SHIKIMORI_CLIENT_SECRET__/g, JSON.stringify(envVars.SHIKIMORI_CLIENT_SECRET || 'IbwfA65ellkh_R08CY_x4Dp_A7hTCIYtYHkFxHWQP08'));
                return { code: replaced, map: null };
            }
        }
    };
}

function serve() {
    let server;

    function toExit() {
        if (server) server.kill(0);
    }

    return {
        writeBundle() {
            if (server) return;
            server = child_process.spawn('npm', ['run', 'start', '--', '--dev'], {
                stdio: ['ignore', 'inherit', 'inherit'],
                shell: true
            });

            process.on('SIGTERM', toExit);
            process.on('exit', toExit);
        }
    };
}

var rollup_config = {
    input: 'src/app/app.js',
    output: {
        sourcemap: true,
        format: 'iife',
        name: 'anideskMain',
        file: 'public/build/bundle.js'
    },
    plugins: [
        envPlugin(),
        svelte({
            compilerOptions: {
                dev: !production
            },
            onwarn: (warning, handler) => {
                if (warning.code.startsWith("a11y-")) return;
                handler(warning);
            }
        }),
        svgo(),
        resolve({
            browser: true,
            dedupe: ['svelte']
        }),
        rollupPluginString.string({
            include: 'src/icons/*.svg',
        }),
        css({ output: 'bundle.css' }),
        commonjs(),
        !production && serve(),
        !production && livereload('public'),
        production && !fastBuild && terser({
            maxWorkers: Math.max(1, Math.floor(os.cpus().length / 2))
        }),
    ],
    watch: {
        clearScreen: false
    }
};

exports.default = rollup_config;
