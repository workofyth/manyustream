let selectedVideoData = null;
let currentOrientation = 'horizontal';
let isDropdownOpen = false;
const videoSelectorDropdown = document.getElementById('videoSelectorDropdown');
let desktopVideoPlayer = null;
let mobileVideoPlayer = null;
let streamKeyTimeout = null;
let isStreamKeyValid = true;
let currentPlatform = 'Custom';
function openNewStreamModal() {
  const modal = document.getElementById('newStreamModal');
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
  const advancedSettingsContent = document.getElementById('advancedSettingsContent');
  const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
  if (advancedSettingsContent && advancedSettingsToggle) {
    advancedSettingsContent.classList.add('hidden');
    const icon = advancedSettingsToggle.querySelector('i');
    if (icon) icon.style.transform = '';
  }
  requestAnimationFrame(() => {
    modal.classList.add('active');
  });
  loadGalleryVideos();
}
function closeNewStreamModal() {
  const modal = document.getElementById('newStreamModal');
  document.body.style.overflow = 'auto';
  modal.classList.remove('active');
  resetModalForm();
  const advancedSettingsContent = document.getElementById('advancedSettingsContent');
  const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
  if (advancedSettingsContent && advancedSettingsToggle) {
    advancedSettingsContent.classList.add('hidden');
    const icon = advancedSettingsToggle.querySelector('i');
    if (icon) icon.style.transform = '';
  }
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
  if (desktopVideoPlayer) {
    desktopVideoPlayer.pause();
    desktopVideoPlayer.dispose();
    desktopVideoPlayer = null;
  }
  if (mobileVideoPlayer) {
    mobileVideoPlayer.pause();
    mobileVideoPlayer.dispose();
    mobileVideoPlayer = null;
  }
}
function toggleVideoSelector() {
  const dropdown = document.getElementById('videoSelectorDropdown');
  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    if (!dropdown.dataset.loaded) {
      loadGalleryVideos();
      dropdown.dataset.loaded = 'true';
    }
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 10);
    }
  } else {
    dropdown.classList.add('hidden');
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
  }
}
function selectVideo(video) {
  selectedVideoData = video;
  const displayText = video.type === 'playlist' ? `[Playlist] ${video.name}` : video.name;
  document.getElementById('selectedVideo').textContent = displayText;
  const videoSelector = document.querySelector('[onclick="toggleVideoSelector()"]');
  videoSelector.classList.remove('border-red-500');
  videoSelector.classList.add('border-gray-600');

  const desktopPreview = document.getElementById('videoPreview');
  const desktopEmptyPreview = document.getElementById('emptyPreview');
  const mobilePreview = document.getElementById('videoPreviewMobile');
  const mobileEmptyPreview = document.getElementById('emptyPreviewMobile');

  if (desktopVideoPlayer) {
    desktopVideoPlayer.pause();
    desktopVideoPlayer.dispose();
    desktopVideoPlayer = null;
  }
  if (mobileVideoPlayer) {
    mobileVideoPlayer.pause();
    mobileVideoPlayer.dispose();
    mobileVideoPlayer = null;
  }

  if (video.type === 'playlist') {
    desktopPreview.classList.add('hidden');
    mobilePreview.classList.add('hidden');
    desktopEmptyPreview.classList.remove('hidden');
    mobileEmptyPreview.classList.remove('hidden');

    const desktopEmptyContent = desktopEmptyPreview.querySelector('div');
    const mobileEmptyContent = mobileEmptyPreview.querySelector('div');

    if (desktopEmptyContent) {
      desktopEmptyContent.innerHTML = `
        <i class="ti ti-playlist text-4xl text-blue-400 mb-2"></i>
        <p class="text-sm text-gray-300 font-medium">${video.name}</p>
        <p class="text-xs text-blue-300 mt-1">Playlist selected • ${video.duration || 'Unknown duration'}</p>
      `;
    }

    if (mobileEmptyContent) {
      mobileEmptyContent.innerHTML = `
        <i class="ti ti-playlist text-4xl text-blue-400 mb-2"></i>
        <p class="text-sm text-gray-300 font-medium">${video.name}</p>
        <p class="text-xs text-blue-300 mt-1">Playlist selected • ${video.duration || 'Unknown duration'}</p>
      `;
    }
  } else {
    desktopPreview.classList.remove('hidden');
    mobilePreview.classList.remove('hidden');
    desktopEmptyPreview.classList.add('hidden');
    mobileEmptyPreview.classList.add('hidden');

    const desktopVideoContainer = document.getElementById('videoPreview');
    const mobileVideoContainer = document.getElementById('videoPreviewMobile');

    desktopVideoContainer.innerHTML = `
      <video id="videojs-preview-desktop" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto">
        <source src="${video.url}" type="video/mp4">
      </video>
    `;
    mobileVideoContainer.innerHTML = `
      <video id="videojs-preview-mobile" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto">
        <source src="${video.url}" type="video/mp4">
      </video>
    `;

    setTimeout(() => {
      try {
        desktopVideoPlayer = videojs('videojs-preview-desktop', {
          controls: true,
          autoplay: false,
          preload: 'auto',
          fluid: true
        });
        
        // Handle video errors
        desktopVideoPlayer.on('error', function() {
          console.error('Desktop video player error:', desktopVideoPlayer.error());
        });
      } catch (err) {
        console.error('Error initializing desktop video player:', err);
      }
      
      try {
        mobileVideoPlayer = videojs('videojs-preview-mobile', {
          controls: true,
          autoplay: false,
          preload: 'auto',
          fluid: true
        });
        
        // Handle video errors
        mobileVideoPlayer.on('error', function() {
          console.error('Mobile video player error:', mobileVideoPlayer.error());
        });
      } catch (err) {
        console.error('Error initializing mobile video player:', err);
      }
    }, 10);
  }

  document.getElementById('videoSelectorDropdown').classList.add('hidden');
  const hiddenVideoInput = document.getElementById('selectedVideoId');
  if (hiddenVideoInput) {
    hiddenVideoInput.value = video.id;
  }
}
async function loadGalleryVideos() {
  try {
    const container = document.getElementById('videoListContainer');
    if (!container) {
      console.error("Video list container not found");
      return;
    }
    container.innerHTML = '<div class="text-center py-3"><i class="ti ti-loader animate-spin mr-2"></i>Loading content...</div>';
    const response = await fetch('/api/stream/content');
    const content = await response.json();
    window.allStreamVideos = content;
    displayFilteredVideos(content);
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      searchInput.removeEventListener('input', handleVideoSearch);
      searchInput.addEventListener('input', handleVideoSearch);
      setTimeout(() => searchInput.focus(), 10);
    } else {
      console.error("Search input element not found");
    }
  } catch (error) {
    console.error('Error loading gallery content:', error);
    const container = document.getElementById('videoListContainer');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5 text-red-400">
          <i class="ti ti-alert-circle text-2xl mb-2"></i>
          <p>Failed to load content</p>
          <p class="text-xs text-gray-500 mt-1">Please try again</p>
        </div>
      `;
    }
  }
}
function handleVideoSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  console.log("Searching for:", searchTerm);
  if (!window.allStreamVideos) {
    console.error("No content available for search");
    return;
  }
  if (searchTerm === '') {
    displayFilteredVideos(window.allStreamVideos);
    return;
  }
  const filteredContent = window.allStreamVideos.filter(item =>
    item.name.toLowerCase().includes(searchTerm) ||
    (item.type === 'playlist' && item.description && item.description.toLowerCase().includes(searchTerm))
  );
  console.log(`Found ${filteredContent.length} matching items`);
  displayFilteredVideos(filteredContent);
}
function displayFilteredVideos(videos) {
  const container = document.getElementById('videoListContainer');
  container.innerHTML = '';
  if (videos && videos.length > 0) {
    videos.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-start space-x-3 p-2 rounded hover:bg-dark-600 transition-colors text-left';
      button.onclick = () => selectVideo(item);

      if (item.type === 'playlist') {
        button.innerHTML = `
          <div class="w-16 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex-shrink-0 overflow-hidden relative">
            <img src="${item.thumbnail}" alt=""
              class="w-full h-full object-cover rounded"
              onerror="this.src='/images/playlist-thumbnail.svg'">
            <div class="absolute top-0 right-0 bg-green-500 text-white text-xs px-1 rounded-bl text-[8px] font-bold">PL</div>
          </div>
          <div class="flex-1 min-w-0 ml-3 text-left">
            <p class="text-sm font-medium text-white truncate flex items-center">
              <i class="ti ti-playlist text-blue-400 mr-1 text-xs"></i>
              ${item.name}
            </p>
            <p class="text-xs text-blue-300">${item.resolution} • ${item.duration}</p>
          </div>
        `;
      } else {
        button.innerHTML = `
          <div class="w-16 h-12 bg-dark-800 rounded flex-shrink-0 overflow-hidden">
            <img src="${item.thumbnail || '/images/default-thumbnail.jpg'}" alt=""
              class="w-full h-full object-cover rounded"
              onerror="this.src='/images/default-thumbnail.jpg'">
          </div>
          <div class="flex-1 min-w-0 ml-3 text-left">
            <p class="text-sm font-medium text-white truncate">${item.name}</p>
            <p class="text-xs text-gray-400">${item.resolution} • ${item.duration}</p>
          </div>
        `;
      }
      container.appendChild(button);
    });
  } else {
    container.innerHTML = `
      <div class="text-center py-5 text-gray-400">
        <i class="ti ti-search-off text-2xl mb-2"></i>
        <p>No matching content found</p>
        <p class="text-xs text-gray-500 mt-1">Try different keywords</p>
      </div>
    `;
  }
}
function resetModalForm() {
  const form = document.getElementById('newStreamForm');
  form.reset();
  selectedVideoData = null;
  document.getElementById('selectedVideo').textContent = 'Choose a video...';
  const desktopPreview = document.getElementById('videoPreview');
  const desktopEmptyPreview = document.getElementById('emptyPreview');
  const mobilePreview = document.getElementById('videoPreviewMobile');
  const mobileEmptyPreview = document.getElementById('emptyPreviewMobile');
  desktopPreview.classList.add('hidden');
  mobilePreview.classList.add('hidden');
  desktopEmptyPreview.classList.remove('hidden');
  mobileEmptyPreview.classList.remove('hidden');

  const desktopEmptyContent = desktopEmptyPreview.querySelector('div');
  const mobileEmptyContent = mobileEmptyPreview.querySelector('div');

  if (desktopEmptyContent) {
    desktopEmptyContent.innerHTML = `
      <i class="ti ti-video text-4xl text-gray-600 mb-2"></i>
      <p class="text-sm text-gray-500">Select a video to preview</p>
    `;
  }

  if (mobileEmptyContent) {
    mobileEmptyContent.innerHTML = `
      <i class="ti ti-video text-4xl text-gray-600 mb-2"></i>
      <p class="text-sm text-gray-500">Select a video to preview</p>
    `;
  }

  if (isDropdownOpen) {
    toggleVideoSelector();
  }
}
function initModal() {
  const modal = document.getElementById('newStreamModal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeNewStreamModal();
    }
  });

  if (videoSelectorDropdown) {
    document.addEventListener('click', (e) => {
      const isClickInsideDropdown = videoSelectorDropdown.contains(e.target);
      const isClickOnButton = e.target.closest('[onclick="toggleVideoSelector()"]');
      if (!isClickInsideDropdown && !isClickOnButton && isDropdownOpen) {
        toggleVideoSelector();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isDropdownOpen) {
        toggleVideoSelector();
      } else if (!modal.classList.contains('hidden')) {
        closeNewStreamModal();
      }
    }
  });
  modal.addEventListener('touchmove', (e) => {
    if (e.target === modal) {
      e.preventDefault();
    }
  }, { passive: false });
}
function setVideoOrientation(orientation) {
  currentOrientation = orientation;
  const buttons = document.querySelectorAll('[onclick^="setVideoOrientation"]');
  buttons.forEach(button => {
    if (button.getAttribute('onclick').includes(orientation)) {
      button.classList.add('bg-primary', 'border-primary', 'text-white');
      button.classList.remove('bg-dark-700', 'border-gray-600');
    } else {
      button.classList.remove('bg-primary', 'border-primary', 'text-white');
      button.classList.add('bg-dark-700', 'border-gray-600');
    }
  });
  updateResolutionDisplay();
}
function updateResolutionDisplay() {
  const select = document.getElementById('resolutionSelect');
  const option = select.options[select.selectedIndex];
  const resolution = option.getAttribute(`data-${currentOrientation}`);
  const quality = option.textContent;
  document.getElementById('currentResolution').textContent = `${resolution} (${quality})`;
}
document.addEventListener('DOMContentLoaded', () => {
  const resolutionSelect = document.getElementById('resolutionSelect');
  if (resolutionSelect) {
    resolutionSelect.addEventListener('change', updateResolutionDisplay);
    setVideoOrientation('horizontal');
  }
});
function toggleStreamKeyVisibility() {
  const streamKeyInput = document.getElementById('streamKey');
  const streamKeyToggle = document.getElementById('streamKeyToggle');
  if (streamKeyInput.type === 'password') {
    streamKeyInput.type = 'text';
    streamKeyToggle.className = 'ti ti-eye-off';
  } else {
    streamKeyInput.type = 'password';
    streamKeyToggle.className = 'ti ti-eye';
  }
}
document.addEventListener('DOMContentLoaded', function () {
  const platformSelector = document.getElementById('platformSelector');
  const platformDropdown = document.getElementById('platformDropdown');
  const rtmpInput = document.getElementById('rtmpUrl');
  if (!platformSelector || !platformDropdown || !rtmpInput) return;
  platformSelector.addEventListener('click', function (e) {
    e.stopPropagation();
    platformDropdown.classList.toggle('hidden');
  });
  const platformOptions = document.querySelectorAll('.platform-option');
  platformOptions.forEach(option => {
    option.addEventListener('click', function () {
      const platformUrl = this.getAttribute('data-url');
      const platformName = this.querySelector('span').textContent;
      rtmpInput.value = platformUrl;
      platformDropdown.classList.add('hidden');
      updatePlatformIcon(this.querySelector('i').className);
    });
  });
  document.addEventListener('click', function (e) {
    if (platformDropdown && !platformDropdown.contains(e.target) &&
      !platformSelector.contains(e.target)) {
      platformDropdown.classList.add('hidden');
    }
  });
  function updatePlatformIcon(iconClass) {
    const currentIcon = platformSelector.querySelector('i');
    const iconParts = iconClass.split(' ');
    const brandIconPart = iconParts.filter(part => part.startsWith('ti-'))[0];
    currentIcon.className = `ti ${brandIconPart} text-center`;
    if (brandIconPart.includes('youtube')) {
      currentIcon.classList.add('text-red-500');
    } else if (brandIconPart.includes('twitch')) {
      currentIcon.classList.add('text-purple-500');
    } else if (brandIconPart.includes('facebook')) {
      currentIcon.classList.add('text-blue-500');
    } else if (brandIconPart.includes('instagram')) {
      currentIcon.classList.add('text-pink-500');
    } else if (brandIconPart.includes('tiktok')) {
      currentIcon.classList.add('text-white');
    } else if (brandIconPart.includes('shopee')) {
      currentIcon.classList.add('text-orange-500');
    } else if (brandIconPart.includes('live-photo')) {
      currentIcon.classList.add('text-teal-500');
    }
  }
  if (typeof showToast !== 'function') {
    window.showToast = function (type, message) {
      console.log(`${type}: ${message}`);
    }
  }
  const streamKeyInput = document.getElementById('streamKey');
  if (streamKeyInput && rtmpInput) {
    rtmpInput.addEventListener('input', function () {
      const url = this.value.toLowerCase();
      if (url.includes('youtube.com')) {
        currentPlatform = 'YouTube';
      } else if (url.includes('facebook.com')) {
        currentPlatform = 'Facebook';
      } else if (url.includes('twitch.tv')) {
        currentPlatform = 'Twitch';
      } else if (url.includes('tiktok.com')) {
        currentPlatform = 'TikTok';
      } else if (url.includes('instagram.com')) {
        currentPlatform = 'Instagram';
      } else if (url.includes('shopee.io')) {
        currentPlatform = 'Shopee Live';
      } else if (url.includes('restream.io')) {
        currentPlatform = 'Restream.io';
      } else {
        currentPlatform = 'Custom';
      }
      if (streamKeyInput && streamKeyInput.value) {
        validateStreamKeyForPlatform(streamKeyInput.value, currentPlatform);
      }
    });
    streamKeyInput.addEventListener('input', function () {
      clearTimeout(streamKeyTimeout);
      const streamKey = this.value.trim();
      if (!streamKey) {
        return;
      }
      streamKeyTimeout = setTimeout(() => {
        validateStreamKeyForPlatform(streamKey, currentPlatform);
      }, 500);
    });
  }
});
function validateStreamKeyForPlatform(streamKey, platform) {
  if (!streamKey.trim()) {
    return;
  }
  fetch(`/api/streams/check-key?key=${encodeURIComponent(streamKey)}`)
    .then(response => response.json())
    .then(data => {
      const streamKeyInput = document.getElementById('streamKey');
      if (data.isInUse) {
        streamKeyInput.classList.add('border-red-500');
        streamKeyInput.classList.remove('border-gray-600', 'focus:border-primary');
        let errorMsg = document.getElementById('streamKeyError');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.id = 'streamKeyError';
          errorMsg.className = 'text-xs text-red-500 mt-1';
          streamKeyInput.parentNode.appendChild(errorMsg);
        }
        errorMsg.textContent = 'This stream key is already in use. Please use a different key.';
        isStreamKeyValid = false;
      } else {
        streamKeyInput.classList.remove('border-red-500');
        streamKeyInput.classList.add('border-gray-600', 'focus:border-primary');
        const errorMsg = document.getElementById('streamKeyError');
        if (errorMsg) {
          errorMsg.remove();
        }
        isStreamKeyValid = true;
      }
    })
    .catch(error => {
      console.error('Error validating stream key:', error);
    });
}
// Function to populate channel dropdowns
async function populateChannels() {
  try {
    const response = await fetch('/api/channels');
    const data = await response.json();

    if (!data.success) {
      console.error('Failed to load channels:', data.error);
      return;
    }

    const channels = data.channels;
    const createChannelSelect = document.getElementById('channelSelect');
    const editChannelSelect = document.getElementById('editChannelSelect');

    // Clear existing options (except the default one)
    if (createChannelSelect) {
      // Remove all options except the first one (default)
      while (createChannelSelect.options.length > 1) {
        createChannelSelect.remove(1);
      }

      channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel.id;
        option.textContent = `${channel.name} (${channel.platform})`;
        createChannelSelect.appendChild(option);
      });
    }

    if (editChannelSelect) {
      // Remove all options except the first one (default)
      while (editChannelSelect.options.length > 1) {
        editChannelSelect.remove(1);
      }

      channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel.id;
        option.textContent = `${channel.name} (${channel.platform})`;
        editChannelSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading channels:', error);
  }
}

// Function to get channel details by ID
async function getChannelDetails(channelId) {
  try {
    const response = await fetch(`/api/channels/${channelId}`);
    const data = await response.json();

    if (data.success) {
      return data.channel;
    } else {
      console.error('Failed to get channel details:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error getting channel details:', error);
    return null;
  }
}

// Function to find a channel by RTMP URL and Stream Key
async function findChannelByDetails(rtmpUrl, streamKey) {
  try {
    const response = await fetch('/api/channels');
    const data = await response.json();

    if (!data.success) {
      console.error('Failed to load channels:', data.error);
      return null;
    }

    const channels = data.channels;
    const matchingChannel = channels.find(channel =>
      channel.rtmp_url === rtmpUrl && channel.stream_key === streamKey
    );

    return matchingChannel || null;
  } catch (error) {
    console.error('Error finding channel by details:', error);
    return null;
  }
}

// Function to refresh channels in create modal
async function refreshChannels() {
  const refreshIcon = document.getElementById('channelRefreshIcon');
  if (refreshIcon) {
    refreshIcon.classList.add('animate-spin');
  }

  try {
    await populateChannels();
    showToast('success', 'Channels refreshed successfully');
  } catch (error) {
    console.error('Error refreshing channels:', error);
    showToast('error', 'Failed to refresh channels');
  } finally {
    if (refreshIcon) {
      refreshIcon.classList.remove('animate-spin');
    }
  }
}

// Function to refresh channels in edit modal
async function refreshEditChannels() {
  const refreshIcon = document.getElementById('editChannelRefreshIcon');
  if (refreshIcon) {
    refreshIcon.classList.add('animate-spin');
  }

  try {
    await populateChannels();
    showToast('success', 'Channels refreshed successfully');
  } catch (error) {
    console.error('Error refreshing channels:', error);
    showToast('error', 'Failed to refresh channels');
  } finally {
    if (refreshIcon) {
      refreshIcon.classList.remove('animate-spin');
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initModal();
  populateChannels(); // Load channels when the page loads
});

// Form submission handler
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('newStreamForm');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const videoId = document.getElementById('selectedVideoId').value;
    const channelId = document.getElementById('channelSelect').value;

    if (!videoId) {
      alert('Please select a video before creating the stream');
      const videoSelector = document.querySelector('[onclick="toggleVideoSelector()"]');
      videoSelector.classList.add('border-red-500');
      videoSelector.classList.remove('border-gray-600');
      videoSelector.animate([
        { transform: 'translateX(0px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(0px)' }
      ], {
        duration: 300,
        iterations: 1
      });
      return;
    }

    if (!channelId) {
      alert('Please select a channel before creating the stream');
      const channelSelect = document.getElementById('channelSelect');
      channelSelect.focus();
      return;
    }

    // Get channel details to fill in RTMP URL and Stream Key
    const channel = await getChannelDetails(channelId);
    if (!channel) {
      alert('Failed to get channel details. Please try again.');
      return;
    }

    const scheduleInput = document.getElementById('scheduleInput');
    const durationInput = document.getElementById('durationInput');
    const resolutionElement = document.getElementById('currentResolution');
    const resolutionText = resolutionElement ? resolutionElement.textContent : '';
    const resolution = resolutionText.split(' ')[0];

    const streamTitleElement = document.getElementById('streamTitle');
    const bitrateSelect = document.getElementById('bitrateSelect');
    const fpsSelect = document.getElementById('fpsSelect');
    const resolutionSelect = document.getElementById('resolutionSelect');
    const loopVideoInput = document.querySelector('input[name="loopVideo"]');
    const advancedSettingsContent = document.getElementById('advancedSettingsContent');

    // Determine if advanced settings should be used based on whether:
    // 1. The advanced settings panel was ever opened, OR
    // 2. Any values differ from defaults (bitrate != 2500, fps != 30, resolution != 720)
    const isAdvancedPanelOpen = advancedSettingsContent ? !advancedSettingsContent.classList.contains('hidden') : false;
    const bitrateValue = bitrateSelect ? parseInt(bitrateSelect.value) : 2500;
    const fpsValue = fpsSelect ? parseInt(fpsSelect.value) : 30;
    const resolutionValue = resolutionSelect ? resolutionSelect.value : '720';
    
    // Check if user changed any advanced settings from defaults
    const hasNonDefaultSettings = bitrateValue !== 2500 || fpsValue !== 30 || resolutionValue !== '720';
    const shouldUseAdvancedSettings = isAdvancedPanelOpen || hasNonDefaultSettings;

    const formData = {
      streamTitle: streamTitleElement ? streamTitleElement.value : '',
      videoId: videoId,
      rtmpUrl: channel.rtmp_url,
      streamKey: channel.stream_key,
      platform: channel.platform,
      platform_icon: channel.platform_icon,
      bitrate: bitrateValue,
      fps: fpsValue,
      loopVideo: loopVideoInput ? loopVideoInput.checked : false,
      orientation: currentOrientation,
      resolution: resolution,
      useAdvancedSettings: shouldUseAdvancedSettings
    };

    if (scheduleInput && scheduleInput.value) {
      formData.scheduleTime = scheduleInput.value;
    }
    if (durationInput && durationInput.value) {
      formData.duration = durationInput.value;
    }

    // Add recurrence data if set
    const recurrenceType = document.getElementById('recurrenceType')?.value;
    if (recurrenceType && recurrenceType !== '') {
      formData.recurrenceType = recurrenceType;
      const recurrenceValue = document.getElementById('recurrenceValue')?.value;
      if (recurrenceValue) {
        formData.recurrenceValue = recurrenceValue;
      }
    }

    const csrfToken = document.querySelector('input[name="_csrf"]')?.value;
    fetch('/api/streams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      body: JSON.stringify(formData)
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Stream created successfully!');
          closeNewStreamModal();
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          alert(`Error: ${data.error || 'Failed to create stream'}`);
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while creating the stream');
      });
  });
});
