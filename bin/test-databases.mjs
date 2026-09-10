import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

// Disposable databases only: no user-supplied database URL, volume, or fixed host port.
const runtime = process.env.CONTAINER_RUNTIME ?? "docker";
const engines = [
  {
    name: "mssql",
    client: "mssql",
    licensed: true,
    image: "mcr.microsoft.com/mssql/server:2022-latest",
    port: 1433,
    env: [
      "ACCEPT_EULA=Y",
      "MSSQL_PID=Developer",
      "MSSQL_SA_PASSWORD=Attachment_Test_42!",
    ],
    ready: [
      "/opt/mssql-tools18/bin/sqlcmd",
      "-S",
      "localhost",
      "-U",
      "sa",
      "-P",
      "Attachment_Test_42!",
      "-C",
      "-b",
      "-Q",
      "SELECT 1",
    ],
  },
  {
    name: "oracle",
    client: "oracledb",
    licensed: true,
    image: "container-registry.oracle.com/database/free:latest-lite",
    port: 1521,
    env: ["ORACLE_PWD=Attachment_Test_42"],
    oracleHealth: true,
  },
  {
    client: "pg",
    name: "pg",
    image: "docker.io/library/postgres:18.4",
    port: 5432,
    env: [
      "POSTGRES_USER=attachment",
      "POSTGRES_PASSWORD=attachment",
      "POSTGRES_DB=attachment_test",
    ],
    ready: ["pg_isready", "-U", "attachment", "-d", "attachment_test"],
  },
  {
    client: "mysql2",
    name: "mysql",
    image: "docker.io/library/mysql:8.4",
    port: 3306,
    env: [
      "MYSQL_ROOT_PASSWORD=root-test-only",
      "MYSQL_USER=attachment",
      "MYSQL_PASSWORD=attachment",
      "MYSQL_DATABASE=attachment_test",
    ],
    ready: [
      "mysqladmin",
      "ping",
      "-h",
      "127.0.0.1",
      "-uroot",
      "-proot-test-only",
      "--silent",
    ],
  },
  {
    name: "mariadb",
    client: "mysql2",
    image: "docker.io/library/mariadb:11.4",
    port: 3306,
    env: [
      "MARIADB_ROOT_PASSWORD=root-test-only",
      "MARIADB_USER=attachment",
      "MARIADB_PASSWORD=attachment",
      "MARIADB_DATABASE=attachment_test",
    ],
    ready: ["healthcheck.sh", "--connect", "--innodb_initialized"],
  },
  ...["better-sqlite3", "sqlite3", "libsql"].map((client) => ({
    name: client,
    client,
  })),
  {
    name: "libsql-server",
    client: "libsql",
    image: "ghcr.io/tursodatabase/libsql-server:latest",
    port: 8080,
    env: ["SQLD_NODE=primary"],
  },
];
const requested = process.argv.slice(2);
const selected = requested.length ? requested : ["pg", "mysql"];
for (const name of selected) {
  if (name !== "all" && !engines.some((engine) => engine.name === name)) {
    throw new Error(
      `Unknown engine ${name}. Choose: ${engines.map((engine) => engine.name).join(", ")}, all`,
    );
  }
}
function runTests(engine, port) {
  const result = spawnSync(
    process.execPath,
    ["build/bin/test.js", "--files", "lucid_server_databases.spec.js"],
    {
      stdio: "inherit",
      timeout: 120000,
      env: {
        ...process.env,
        ATTACHMENT_TEST_CLIENT: engine.client,
        ATTACHMENT_TEST_ENGINE: engine.name,
        ATTACHMENT_TEST_PORT: port ?? "",
      },
    },
  );
  if (result.error) throw result.error;
  return result.status === 0;
}
const command = (...args) =>
  execFileSync(runtime, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let failed = false;
for (const engine of engines.filter(
  (engine) =>
    (selected.includes("all") && !engine.licensed) ||
    selected.includes(engine.name),
)) {
  if (!engine.image) {
    try {
      if (!runTests(engine)) failed = true;
    } catch (error) {
      failed = true;
      console.error(error);
    }
    continue;
  }
  const name = `attachment-test-${engine.client}-${randomUUID()}`;
  try {
    console.log(`\nStarting ${engine.image} with ${runtime}`);
    execFileSync(
      runtime,
      [
        "run",
        "-d",
        "--name",
        name,
        "-p",
        `127.0.0.1::${engine.port}`,
        ...engine.env.flatMap((entry) => ["-e", entry]),
        engine.image,
      ],
      { stdio: "inherit" },
    );
    const port = command("port", name, `${engine.port}/tcp`).split(":").at(-1);
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        if (engine.oracleHealth) {
          if (
            command("inspect", "--format", "{{.State.Health.Status}}", name) !==
            "healthy"
          )
            throw new Error("Oracle is not ready");
          // Health may turn green before the image finishes setting ORACLE_PWD.
          const { default: oracledb } = await import("oracledb");
          const probe = await oracledb.getConnection({
            user: "system",
            password: "Attachment_Test_42",
            connectString: `127.0.0.1:${port}/FREEPDB1`,
          });
          await probe.close();
        } else if (engine.ready) command("exec", name, ...engine.ready);
        else {
          const response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (!response.ok) throw new Error("Database is not ready");
        }
        ready = true;
        break;
      } catch {
        if (attempt % 30 === 0)
          console.log(`Waiting for ${engine.name} readiness...`);
        await setTimeout(1000);
      }
    }
    if (!ready) throw new Error("Database startup timed out");
    if (!runTests(engine, port)) failed = true;
  } catch (error) {
    failed = true;
    console.error(error);
    try {
      console.error(command("logs", "--tail", "50", name));
    } catch {}
  } finally {
    // Only this invocation's UUID-named container and its anonymous volumes.
    try {
      command("rm", "-f", "-v", name);
    } catch (error) {
      failed = true;
      console.error(error);
    }
  }
}
process.exitCode = failed ? 1 : 0;
