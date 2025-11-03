import { supabase } from '../supabaseClient.js';

let currentUser = null;

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = './admin-login.html';
        return null;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();

    if (!profile || !profile.is_admin) {
        alert('Access denied. Admin privileges required.');
        await supabase.auth.signOut();
        window.location.href = './admin-login.html';
        return null;
    }

    return session.user;
}

async function loadStats() {
    const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

    const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true });

    const { count: likesCount } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true });

    const { count: commentsCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true });

    document.getElementById('totalUsers').textContent = usersCount || 0;
    document.getElementById('totalPosts').textContent = postsCount || 0;
    document.getElementById('totalLikes').textContent = likesCount || 0;
    document.getElementById('totalComments').textContent = commentsCount || 0;
}

async function loadUsers() {
    const usersTableBody = document.getElementById('usersTableBody');

    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (profilesError) {
        usersTableBody.innerHTML = '<tr><td colspan="5" class="error-message show">Error loading users</td></tr>';
        return;
    }

    const userIds = profiles.map(p => p.id);
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
        console.error('Error loading auth users:', authError);
    }

    const emailMap = new Map();
    if (authUsers && authUsers.users) {
        authUsers.users.forEach(user => {
            emailMap.set(user.id, user.email);
        });
    }

    if (!profiles || profiles.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found</td></tr>';
        return;
    }

    usersTableBody.innerHTML = profiles.map(profile => {
        const email = emailMap.get(profile.id) || 'N/A';
        const joinedDate = new Date(profile.created_at).toLocaleDateString();

        return `
            <tr>
                <td>@${profile.username}</td>
                <td>${profile.full_name}</td>
                <td>${email}</td>
                <td>${profile.is_admin ? '<span class="admin-badge">ADMIN</span>' : '-'}</td>
                <td>${joinedDate}</td>
            </tr>
        `;
    }).join('');
}

async function loadAllPosts() {
    const postsContainer = document.getElementById('adminPostsContainer');

    const { data: posts, error } = await supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        postsContainer.innerHTML = '<div class="error-message show">Error loading posts</div>';
        return;
    }

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = '<div class="empty-state"><h3>No posts yet</h3></div>';
        return;
    }

    postsContainer.innerHTML = posts.map(post => createPostCard(post)).join('');

    posts.forEach(post => {
        const deleteBtn = document.querySelector(`[data-post-id="${post.id}"][data-action="admin-delete"]`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deletePost(post.id));
        }
    });
}

function createPostCard(post) {
    const timeSince = getTimeSince(new Date(post.created_at));

    return `
        <div class="post-card">
            <div class="post-header">
                <img src="${post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.profiles.full_name)}`}" alt="Avatar" class="avatar-medium">
                <div class="post-author-info">
                    <div class="post-author-name">${post.profiles.full_name}</div>
                    <div class="post-username">@${post.profiles.username}</div>
                </div>
                <div class="post-time">${timeSince}</div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            ${post.image_url ? `<img src="${post.image_url}" alt="Post image" class="post-image">` : ''}
            <div class="post-actions">
                <button class="action-btn">🤍 ${post.likes_count || 0}</button>
                <button class="action-btn delete-btn" data-post-id="${post.id}" data-action="admin-delete">🗑️ Delete</button>
            </div>
        </div>
    `;
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

    if (error) {
        alert('Error deleting post: ' + error.message);
        return;
    }

    await loadAllPosts();
    await loadStats();
}

function getTimeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'just now';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin-login.html';
});

(async () => {
    currentUser = await checkAuth();
    if (currentUser) {
        await loadStats();
        await loadUsers();
        await loadAllPosts();

        supabase
            .channel('admin-posts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
                loadAllPosts();
                loadStats();
            })
            .subscribe();

        supabase
            .channel('admin-profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                loadUsers();
                loadStats();
            })
            .subscribe();
    }
})();
