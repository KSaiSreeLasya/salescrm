import fs from 'fs/promises';
import path from 'path';

const LEADS_FILE = 'server/data/leads.json';
const CONFIG_FILE = 'server/data/config.json';

function normalizePhone(p) {
  return p.replace(/[^\d+]/g, '');
}

function isValidLead(lead) {
  const vals = Object.values(lead.fields || {}).map((v) =>
    (v || '').toString().trim(),
  );
  const nonEmpty = vals.filter((v) => v !== '');
  if (nonEmpty.length === 0) return false;

  // Check if only one non-empty value - likely junk
  if (nonEmpty.length === 1) {
    const v = nonEmpty[0];
    const dateLike =
      /^\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}$/.test(v) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v) ||
      /^`\d{2}-\d{2}-\d{4}$/.test(v);
    const totalLike = /^sum|^total|^subtotal/i.test(v);
    const numericOnly = /^[-+]?\d{1,3}(?:[\,\d]*)(?:\.\d+)?$/.test(
      v.replace(/\s+/g, ''),
    );
    if (dateLike || totalLike || numericOnly) return false;
  }

  // Check if this is a real lead (has name, email or phone)
  const hasRealData = !!(lead.name || lead.email || lead.phone);
  if (!hasRealData) {
    // If no name, email or phone, at least need 2+ meaningful fields
    const keyFields = [
      'full name',
      'phone',
      'email',
      'what_is_your_average_monthly_electricity_bill?',
      'what_type_of_property_do_you_want_to_install_solar_on?',
    ];
    const realFieldCount = keyFields.filter(
      (k) => (lead.fields?.[k] || '').toString().trim() !== '',
    ).length;
    if (realFieldCount < 2) return false;
  }

  return true;
}

async function cleanupLeads() {
  try {
    console.log('Reading leads.json...');
    const data = JSON.parse(await fs.readFile(LEADS_FILE, 'utf8'));
    console.log(`Found ${data.length} total leads`);

    // Filter invalid leads
    const validLeads = data.filter(isValidLead);
    console.log(`After filtering: ${validLeads.length} valid leads`);

    // Deduplicate by email and phone
    const byEmail = new Map();
    const byPhone = new Map();
    const deduplicated = [];

    for (const lead of validLeads) {
      const email = lead.email?.toLowerCase();
      const phone = lead.phone ? normalizePhone(lead.phone) : null;

      if (email && byEmail.has(email)) {
        console.log(`Removing duplicate lead by email: ${email}`);
        continue;
      }
      if (phone && byPhone.has(phone)) {
        console.log(`Removing duplicate lead by phone: ${phone}`);
        continue;
      }

      if (email) byEmail.set(email, lead.id);
      if (phone) byPhone.set(phone, lead.id);
      deduplicated.push(lead);
    }

    console.log(`After deduplication: ${deduplicated.length} leads`);

    // Save cleaned leads
    await fs.writeFile(LEADS_FILE, JSON.stringify(deduplicated, null, 2));
    console.log(`Saved cleaned leads to ${LEADS_FILE}`);

    // Clean config.json headers (remove empty strings)
    console.log('\nCleaning config.json headers...');
    const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    const originalHeaders = config.headers || [];
    const cleanedHeaders = originalHeaders.filter((h) => h && h.trim());
    config.headers = cleanedHeaders;

    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`Cleaned headers: ${originalHeaders.length} -> ${cleanedHeaders.length}`);
    console.log('Cleaned config headers to:', cleanedHeaders);

    console.log('\n✅ Cleanup completed successfully!');
    console.log(`📊 Summary: Removed ${data.length - deduplicated.length} leads (${((1 - deduplicated.length / data.length) * 100).toFixed(1)}%)`);
  } catch (err) {
    console.error('Cleanup failed:', err);
    process.exit(1);
  }
}

cleanupLeads();
