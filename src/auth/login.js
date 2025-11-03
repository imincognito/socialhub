import { supabase } from '../supabaseClient.js';

const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    errorMessage.textContent = '';
    errorMessage.classList.remove('show');

    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Logging in...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        window.location.href = './feed.html';
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.add('show');
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
    }
});

(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = 'https://imincognito.github.io/socialhub/feed.html';
    }
})();
