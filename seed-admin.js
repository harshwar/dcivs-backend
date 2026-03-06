const bcrypt = require('bcryptjs');
const supabase = require('./db');

async function seedAdmin() {
    const email = 'admin@example.com';
    const password = 'admin123';
    const username = 'admin';

    try {
        console.log("🌱 Seeding Admin...");
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if admin exists first
        const { data: existing, error: findError } = await supabase
            .from('admins')
            .select('id')
            .eq('email', email)
            .single();

        if (existing) {
             console.log('⚠️ Admin already exists. Skipping.');
             return;
        }

        const { data, error } = await supabase
            .from('admins')
            .insert([{
                username,
                email,
                password_hash: hashedPassword,
                role: 'super_admin'
            }])
            .select();

        if (error) {
            console.error('❌ Error seeding admin:', error.message);
        } else {
            console.log('✅ Admin seeded successfully:', email);
        }
    } catch (err) {
        console.error('❌ Seed script failed:', err);
    }
}

seedAdmin();
