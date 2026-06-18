import { syncDatabase } from '../src/db';

async function main() {
    try {
        await syncDatabase();
        console.log('🟢 SQL Database connection successful!');
        process.exit(0);
    } catch (err: any) {
        console.error('❌ SQL Database connection failed:', err.message || err);
        process.exit(1);
    }
}

main();
