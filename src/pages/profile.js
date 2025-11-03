import { supabase } from '../supabaseClient.js';

let currentUser = null;
let currentProfile = null;

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = './login.html';
        return null;
    }
    return session.user;
}

async function loadProfile() {
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
        currentProfile = data;
        const avatarUrl = data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}&background=667eea&color=fff&size=200`;

        document.getElementById('profileAvatar').src = avatarUrl;
        document.getElementById('profileFullName').textContent = data.full_name;
        document.getElementById('profileUsername').textContent = data.username;
        document.getElementById('profileBio').textContent = data.bio || 'No bio yet';

        const joinedDate = new Date(data.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('profileJoined').textContent = joinedDate;
    }
}

async function loadUserPosts() {
    const postsContainer = document.getElementById('userPostsContainer');

    const { data: posts, error } = await supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, full_name, avatar_url)
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        postsContainer.innerHTML = '<div class="error-message show">Error loading posts</div>';
        return;
    }

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Share your first moment!</p></div>';
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

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deletePost(post.id));
        }
    });
}

function createPostCard(post, isLiked) {
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
                <button class="action-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" data-action="like">
                    ${isLiked ? '❤️' : '🤍'} ${post.likes_count || 0}
                </button>
                <button class="action-btn delete-btn" data-post-id="${post.id}" data-action="delete">🗑️ Delete</button>
            </div>
        </div>
    `;
}

async function toggleLike(postId, isCurrentlyLiked) {
    if (isCurrentlyLiked) {
        await supabase
            .from('likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentUser.id);
    } else {
        await supabase
            .from('likes')
            .insert([{ post_id: postId, user_id: currentUser.id }]);
    }

    loadUserPosts();
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

    loadUserPosts();
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

const modal = document.getElementById('editProfileModal');
const editProfileBtn = document.getElementById('editProfileBtn');
const closeModalBtns = document.querySelectorAll('.close-modal');

editProfileBtn.addEventListener('click', () => {
    document.getElementById('editFullName').value = currentProfile.full_name;
    document.getElementById('editBio').value = currentProfile.bio || '';
    document.getElementById('editAvatarUrl').value = currentProfile.avatar_url || '';
    modal.classList.add('show');
});

closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('show');
    }
});

document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('editFullName').value;
    const bio = document.getElementById('editBio').value;
    const avatarUrl = document.getElementById('editAvatarUrl').value;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            bio: bio,
            avatar_url: avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=667eea&color=fff&size=200`
        })
        .eq('id', currentUser.id);

    if (error) {
        alert('Error updating profile: ' + error.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Save Changes';
        return;
    }

    modal.classList.remove('show');
    submitButton.disabled = false;
    submitButton.textContent = 'Save Changes';

    await loadProfile();
    await loadUserPosts();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
});

(async () => {
    currentUser = await checkAuth();
    if (currentUser) {
        await loadProfile();
        await loadUserPosts();
    }
})();
