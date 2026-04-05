require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        const res = await client.query('SELECT * FROM nfts ORDER BY id DESC LIMIT 5');
        
        let out = 'Latest NFTs in DB:\n';
        if (res.rows.length === 0) {
            out += 'Absolutely ZERO rows in nfts table!!';
        } else {
            res.rows.forEach(r => {
                out += `ID: ${r.id} | Cert ID: ${r.certificate_id} | Token ID: ${r.token_id === null ? 'NULL' : r.token_id} | Hash: ${r.transaction_hash}\n`;
            });
        }
        
        const certRes = await client.query('SELECT * FROM certificates ORDER BY id DESC LIMIT 2');
        out += '\nLatest Certificates in DB:\n';
        if (certRes.rows.length === 0) {
            out += 'No certificates.';
        } else {
            certRes.rows.forEach(r => {
                out += `ID: ${r.id} | Title: ${r.title} | Recipient: ${r.recipient_id}\n`;
            });
        }

        fs.writeFileSync('db_results.txt', out);
    } catch (e) {
        fs.writeFileSync('db_results.txt', 'DB Error: ' + String(e));
    } finally {
        await client.end();
    }
}

run();
