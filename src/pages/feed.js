import { supabase } from '../supabaseClient.js';

let currentUser = null;

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = './login.html';
        return null;
    }
    return session.user;
}

async function loadCurrentUserProfile() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (error) {
        console.error('Error loading profile:', error);
        return;
    }

    if (data) {
        document.getElementById('sidebarAvatar').src = data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}&background=667eea&color=fff&size=200`;
        document.getElementById('sidebarUsername').textContent = data.full_name;
        document.getElementById('sidebarBio').textContent = data.bio || 'No bio yet';
    }
}

async function loadPosts() {
    const postsContainer = document.getElementById('postsContainer');

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
        postsContainer.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Be the first to share something!</p></div>';
        return;
    }

    const { data: userLikes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', currentUser.id);

    const likedPostIds = new Set(userLikes?.map(like => like.post_id) || []);

    postsContainer.innerHTML = posts.map(post => createPostCard(post, likedPostIds.has(post.id))).join('');

    posts.forEach(post => {
        const likeBtn = document.querySelector(`[data-post-id="${post.id}"][data-action="like"]`);
        const deleteBtn = document.querySelector(`[data-post-id="${post.id}"][data-action="delete"]`);

        if (likeBtn) {
            likeBtn.addEventListener('click', () => toggleLike(post.id, likedPostIds.has(post.id)));
        }

        if (deleteBtn && post.user_id === currentUser.id) {
            deleteBtn.addEventListener('click', () => deletePost(post.id));
        }
    });
}

function createPostCard(post, isLiked) {
    const timeSince = getTimeSince(new Date(post.created_at));
    const isOwner = post.user_id === currentUser.id;

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
                <button class="action-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" data-action="like">
                    ${isLiked ? '❤️' : '🤍'} ${post.likes_count || 0}
                </button>
                ${isOwner ? `<button class="action-btn delete-btn" data-post-id="${post.id}" data-action="delete">🗑️ Delete</button>` : ''}
            </div>
        </div>
    `;
}

async function toggleLike(postId, isCurrentlyLiked) {
    if (isCurrentlyLiked) {
        const { error } = await supabase
            .from('likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentUser.id);

        if (error) {
            console.error('Error removing like:', error);
            return;
        }
    } else {
        const { error } = await supabase
            .from('likes')
            .insert([{ post_id: postId, user_id: currentUser.id }]);

        if (error) {
            console.error('Error adding like:', error);
            return;
        }
    }

    loadPosts();
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

    loadPosts();
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

document.getElementById('createPostForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const content = document.getElementById('postContent').value;
    const imageUrl = document.getElementById('postImage').value;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Posting...';

    const { error } = await supabase
        .from('posts')
        .insert([{
            user_id: currentUser.id,
            content,
            image_url: imageUrl
        }]);

    if (error) {
        alert('Error creating post: ' + error.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Post';
        return;
    }

    document.getElementById('postContent').value = '';
    document.getElementById('postImage').value = '';
    submitButton.disabled = false;
    submitButton.textContent = 'Post';

    loadPosts();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
});

(async () => {
    currentUser = await checkAuth();
    if (currentUser) {
        await loadCurrentUserProfile();
        await loadPosts();

        supabase
            .channel('posts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
                loadPosts();
            })
            .subscribe();
    }
})();
