import { supabase } from '../supabaseClient.js';

const signupForm = document.getElementById('signupForm');
const errorMessage = document.getElementById('errorMessage');

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('fullName').value;
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const bio = document.getElementById('bio').value;

    errorMessage.textContent = '';
    errorMessage.classList.remove('show');

    const submitButton = signupForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Creating account...';

    try {
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existingProfile) {
            throw new Error('Username already taken. Please choose another one.');
        }

        const { data: authData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (signUpError) throw signUpError;

        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: authData.user.id,
                username,
                full_name: fullName,
                bio: bio || '',
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=667eea&color=fff&size=200`,
            }]);

        if (profileError) throw profileError;

        window.location.href = './feed.html';
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.add('show');
        submitButton.disabled = false;
        submitButton.textContent = 'Sign Up';
    }
});

(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = './feed.html';
    }
})();
