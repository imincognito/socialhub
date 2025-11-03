import { supabase } from '../supabaseClient.js';

const adminLoginForm = document.getElementById('adminLoginForm');
const errorMessage = document.getElementById('errorMessage');

adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    errorMessage.textContent = '';
    errorMessage.classList.remove('show');

    const submitButton = adminLoginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Verifying...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', data.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || !profile.is_admin) {
            await supabase.auth.signOut();
            throw new Error('Access denied. Admin privileges required.');
        }

        window.location.href = './admin.html';
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.add('show');
        submitButton.disabled = false;
        submitButton.textContent = 'Login as Admin';
    }
});

(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profile && profile.is_admin) {
            window.location.href = './admin.html';
        }
    }
})();
