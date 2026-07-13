const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Usage : npm run tunnel -- <PORT>");
  console.error("Exemple : npm run tunnel -- 5173");
  process.exit(1);
}

const viteConfigPath = path.resolve(process.cwd(), "vite.config.ts");

const ngrok = spawn("ngrok", ["http", String(port)], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: false,
});

ngrok.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(
      "La commande ngrok est introuvable. Vérifie que ngrok est dans le PATH."
    );
  } else {
    console.error(`Impossible de lancer ngrok : ${error.message}`);
  }

  process.exit(1);
});

ngrok.on("exit", (code, signal) => {
  if (signal) {
    console.log(`ngrok arrêté par le signal ${signal}.`);
  } else if (code !== 0 && code !== null) {
    console.error(`ngrok s'est arrêté avec le code ${code}.`);
  }
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getNgrokUrl() {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(
        "http://127.0.0.1:4040/api/tunnels"
      );

      if (response.ok) {
        const data = await response.json();

        const tunnel =
          data.tunnels.find((item) => item.proto === "https") ??
          data.tunnels[0];

        if (tunnel?.public_url) {
          return tunnel.public_url;
        }
      }
    } catch {
      // ngrok est probablement encore en cours de démarrage.
    }

    await sleep(500);
  }

  throw new Error(
    "Impossible de récupérer l'URL ngrok depuis l'API locale."
  );
}

async function updateViteConfig(publicUrl) {
  const hostname = new URL(publicUrl).hostname;

  let config = await fs.readFile(viteConfigPath, "utf8");

  const startMarker = "// NGROK_HOST_START";
  const endMarker = "// NGROK_HOST_END";

  const startIndex = config.indexOf(startMarker);
  const endIndex = config.indexOf(endMarker);

  if (
    startIndex === -1 ||
    endIndex === -1 ||
    endIndex <= startIndex
  ) {
    throw new Error(
      `Les marqueurs ${startMarker} et ${endMarker} sont absents de vite.config.ts.`
    );
  }

  // Récupère automatiquement l'indentation des marqueurs.
  const lineStart = config.lastIndexOf("\n", startIndex) + 1;
  const indentation =
    config.slice(lineStart, startIndex).match(/^\s*/)?.[0] ?? "";

  const replacement = [
    startMarker,
    `${indentation}"${hostname}",`,
    `${indentation}${endMarker}`,
  ].join("\n");

  config =
    config.slice(0, startIndex) +
    replacement +
    config.slice(endIndex + endMarker.length);

  await fs.writeFile(viteConfigPath, config, "utf8");

  return hostname;
}

async function stopNgrok(signal) {
  console.log(`\nArrêt de ngrok (${signal})...`);

  if (!ngrok.killed) {
    ngrok.kill("SIGTERM");
  }

  // Laisse un court délai au processus pour se terminer proprement.
  await sleep(300);
  process.exit(0);
}

async function main() {
  try {
    console.log(`Lancement de : ngrok http ${port}`);

    const publicUrl = await getNgrokUrl();
    const hostname = await updateViteConfig(publicUrl);

    console.log();
    console.log("Tunnel ngrok démarré.");
    console.log(`URL publique : ${publicUrl}`);
    console.log(`Host Vite    : ${hostname}`);
    console.log("vite.config.ts mis à jour.");
    console.log("Utilise Ctrl+C pour arrêter le tunnel.");
    console.log();
  } catch (error) {
    console.error(`Erreur : ${error.message}`);

    if (!ngrok.killed) {
      ngrok.kill("SIGTERM");
    }

    process.exit(1);
  }
}

process.on("SIGINT", () => stopNgrok("SIGINT"));
process.on("SIGTERM", () => stopNgrok("SIGTERM"));

main();