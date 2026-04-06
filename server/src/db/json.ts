import fs from 'fs';
import path from 'path';
import { DatabaseInterface, Fan } from './interfaces.js';

/**
 * Simple JSON file database for album fans
 */
export class DbJson implements DatabaseInterface {
  private filePath: string;
  private data: Record<string, Fan> = {};

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (fs.existsSync(this.filePath)) {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(content);
    } else {
      this.data = {};
      await this.save();
    }
  }

  private async save(): Promise<void> {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async getFan(did: string): Promise<Fan | null> {
    return this.data[did] || null;
  }

  async setFan(did: string, fan: Fan): Promise<void> {
    this.data[did] = fan;
    await this.save();
  }

  async deleteFan(did: string): Promise<void> {
    delete this.data[did];
    await this.save();
  }

  async listFans(): Promise<Record<string, Fan>> {
    return { ...this.data };
  }
}
