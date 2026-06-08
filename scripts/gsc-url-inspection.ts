import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { google, searchconsole_v1 } from 'googleapis';

type CliOptions = {
  baseUrl: string;
  delayMs: number;
  dryRun: boolean;
  help: boolean;
  input?: string;
  languageCode: string;
  limit?: number;
  output: string;
  siteUrl: string;
};

type InspectionOutput = {
  generatedAt: string;
  siteUrl: string;
  inputFile: string;
  total: number;
  summary: Record<string, number>;
  results: Array<Record<string, unknown>>;
};

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  type?: string;
  [key: string]: unknown;
};

const DEFAULT_SITE_URL = 'https://dukystore.com/';
const DEFAULT_OUTPUT = 'docs/seo/gsc-results/url-inspection-results.json';

function getArgValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(`--${name}`);

  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function normalizeSiteUrl(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) {
    return siteUrl;
  }

  return siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const siteUrl = normalizeSiteUrl(
    getArgValue(args, 'siteUrl') ??
      process.env.GSC_SITE_URL ??
      DEFAULT_SITE_URL,
  );

  return {
    baseUrl:
      getArgValue(args, 'baseUrl') ??
      process.env.GSC_PUBLIC_BASE_URL ??
      DEFAULT_SITE_URL,
    delayMs: parseInteger(
      getArgValue(args, 'delayMs') ?? process.env.GSC_INSPECTION_DELAY_MS,
      1200,
    ),
    dryRun: hasFlag(args, 'dry-run'),
    help: hasFlag(args, 'help') || hasFlag(args, 'h'),
    input: getArgValue(args, 'input') ?? process.env.GSC_INPUT_FILE,
    languageCode:
      getArgValue(args, 'languageCode') ??
      process.env.GSC_LANGUAGE_CODE ??
      'vi',
    limit: getArgValue(args, 'limit')
      ? parseInteger(getArgValue(args, 'limit'), 0)
      : undefined,
    output:
      getArgValue(args, 'output') ??
      process.env.GSC_OUTPUT_FILE ??
      DEFAULT_OUTPUT,
    siteUrl,
  };
}

function printHelp(): void {
  console.log(`
Inspect URLs with Google Search Console URL Inspection API.

Usage:
  npm run gsc:inspect -- --input docs/seo/gsc-exports/page-indexing.csv
  npm run gsc:inspect -- --input urls.txt --dry-run

Required before real API calls:
  GSC_SITE_URL=https://dukystore.com/
  GSC_SERVICE_ACCOUNT_JSON_BASE64=<base64 service account JSON>

Optional local fallback:
  GSC_SERVICE_ACCOUNT_KEY_FILE=.gsc/dukystore-search-console.json

Options:
  --input <path>         CSV/TXT export containing absolute URLs or /paths
  --output <path>        JSON output path
  --siteUrl <property>   Search Console property, e.g. https://dukystore.com/ or sc-domain:dukystore.com
  --baseUrl <url>        Base URL for relative paths in the input file
  --languageCode <code>  Google issue language, default vi
  --delayMs <number>     Delay between API calls, default 1200
  --limit <number>       Inspect only first N URLs
  --dry-run              Parse input only; no Google API call
`);
}

function toAbsoluteUrl(value: string, baseUrl: string): string | undefined {
  const trimmed = value
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.,;:)\]]+$/g, '');

  if (!trimmed) {
    return undefined;
  }

  try {
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, baseUrl).toString();
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function readUrls(inputPath: string, baseUrl: string): Promise<string[]> {
  const raw = await readFile(inputPath, 'utf8');
  const urls = new Set<string>();
  const absoluteMatches = raw.match(/https?:\/\/[^\s"',<>`]+/gi) ?? [];

  for (const match of absoluteMatches) {
    const url = toAbsoluteUrl(match, baseUrl);

    if (url) {
      urls.add(url);
    }
  }

  for (const line of raw.split(/\r?\n/)) {
    for (const cell of line.split(/[,\t;]/)) {
      const url = toAbsoluteUrl(cell, baseUrl);

      if (url) {
        urls.add(url);
      }
    }
  }

  return Array.from(urls);
}

function summarize(
  results: InspectionOutput['results'],
): Record<string, number> {
  return results.reduce<Record<string, number>>((acc, item) => {
    const key =
      (item.coverageState as string | undefined) ??
      (item.verdict as string | undefined) ??
      (item.errorStatus as string | undefined) ??
      'UNKNOWN';

    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function parseCredentialJson(rawJson: string): ServiceAccountCredentials {
  const parsed = JSON.parse(rawJson) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('credential JSON must be an object');
  }

  const record = parsed as Record<string, unknown>;
  const clientEmail = record.client_email;
  const privateKey = record.private_key;

  if (typeof clientEmail !== 'string' || !clientEmail.trim()) {
    throw new Error('credential JSON is missing client_email');
  }

  if (typeof privateKey !== 'string' || !privateKey.trim()) {
    throw new Error('credential JSON is missing private_key');
  }

  return {
    ...record,
    client_email: clientEmail.trim(),
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

function resolveAuthOptions(): ConstructorParameters<
  typeof google.auth.GoogleAuth
>[0] {
  const baseOptions = {
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  };
  const base64Json = process.env.GSC_SERVICE_ACCOUNT_JSON_BASE64?.trim();

  if (base64Json) {
    return {
      ...baseOptions,
      credentials: parseCredentialJson(
        Buffer.from(base64Json, 'base64').toString('utf8'),
      ),
    };
  }

  const rawJson = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();

  if (rawJson) {
    return {
      ...baseOptions,
      credentials: parseCredentialJson(rawJson),
    };
  }

  const clientEmail = process.env.GSC_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GSC_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');

  if (clientEmail || privateKey) {
    if (!clientEmail || !privateKey) {
      throw new Error(
        'Both GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY are required when using split env credentials.',
      );
    }

    return {
      ...baseOptions,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
        project_id: process.env.GSC_PROJECT_ID?.trim(),
        type: 'service_account',
      },
    };
  }

  const keyFile =
    process.env.GSC_SERVICE_ACCOUNT_KEY_FILE ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyFile) {
    throw new Error(
      'Missing GSC_SERVICE_ACCOUNT_JSON_BASE64, GSC_SERVICE_ACCOUNT_JSON, GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY, or GSC_SERVICE_ACCOUNT_KEY_FILE.',
    );
  }

  if (!existsSync(resolve(keyFile))) {
    throw new Error(`Google service account key file not found: ${keyFile}`);
  }

  return {
    ...baseOptions,
    keyFile,
  };
}

async function inspectUrls(options: CliOptions, urls: string[]) {
  const auth = new google.auth.GoogleAuth(resolveAuthOptions());
  const searchconsole: searchconsole_v1.Searchconsole = google.searchconsole({
    version: 'v1',
    auth,
  });
  const results: InspectionOutput['results'] = [];

  for (const [index, inspectionUrl] of urls.entries()) {
    process.stdout.write(
      `[${index + 1}/${urls.length}] Inspecting ${inspectionUrl}\n`,
    );

    try {
      const response = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl,
          languageCode: options.languageCode,
          siteUrl: options.siteUrl,
        },
      });
      const result = response.data.inspectionResult ?? {};
      const indexStatus = result.indexStatusResult ?? {};
      const mobileUsability = result.mobileUsabilityResult ?? {};
      const richResults = result.richResultsResult ?? {};

      results.push({
        coverageState: indexStatus.coverageState,
        googleCanonical: indexStatus.googleCanonical,
        indexingState: indexStatus.indexingState,
        inspectionUrl,
        lastCrawlTime: indexStatus.lastCrawlTime,
        mobileUsabilityVerdict: mobileUsability.verdict,
        pageFetchState: indexStatus.pageFetchState,
        referringUrls: indexStatus.referringUrls,
        richResultsVerdict: richResults.verdict,
        robotsTxtState: indexStatus.robotsTxtState,
        sitemap: indexStatus.sitemap,
        userCanonical: indexStatus.userCanonical,
        verdict: indexStatus.verdict,
      });
    } catch (error) {
      const apiError = error as {
        code?: number;
        errors?: unknown;
        message?: string;
        response?: { status?: number; statusText?: string };
      };

      results.push({
        errorCode: apiError.code,
        errorMessage: apiError.message ?? 'Unknown Google API error',
        errorStatus: apiError.response?.statusText,
        errorStatusCode: apiError.response?.status,
        inspectionUrl,
      });
    }

    if (index < urls.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  return results;
}

async function main() {
  const options = parseCliOptions();

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    throw new Error('Missing --input or GSC_INPUT_FILE.');
  }

  const inputPath = resolve(options.input);

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${options.input}`);
  }

  let urls = await readUrls(inputPath, options.baseUrl);

  if (options.limit && options.limit > 0) {
    urls = urls.slice(0, options.limit);
  }

  if (!urls.length) {
    throw new Error(`No URLs found in ${options.input}.`);
  }

  if (options.dryRun) {
    console.log(`Parsed ${urls.length} URL(s).`);
    console.log(urls.slice(0, 20).join('\n'));
    return;
  }

  const results = await inspectUrls(options, urls);
  const output: InspectionOutput = {
    generatedAt: new Date().toISOString(),
    inputFile: inputPath,
    results,
    siteUrl: options.siteUrl,
    summary: summarize(results),
    total: results.length,
  };
  const outputPath = resolve(options.output);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${results.length} inspection result(s) to ${options.output}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
