import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "server", "data");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJSON<T>(file: string, fallback: T): Promise<T> {
  await ensureDir();
  const filePath = path.join(DATA_DIR, file);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      await writeJSON(file, fallback);
      return fallback;
    }
    throw err;
  }
}

export async function writeJSON<T>(file: string, data: T): Promise<void> {
  await ensureDir();
  const filePath = path.join(DATA_DIR, file);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
