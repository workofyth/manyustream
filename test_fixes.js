const Stream = require('./models/Stream');

async function testDuplicatePrevention() {
  console.log('Testing duplicate stream prevention...');
  
  try {
    // Create a sample stream
    const streamData = {
      title: 'Test Stream',
      rtmp_url: 'rtmp://example.com/live',
      stream_key: 'test_key_123',
      platform: 'Custom',
      platform_icon: 'ti-broadcast',
      bitrate: 2500,
      resolution: '1280x720',
      fps: 30,
      user_id: '123e4567-e89b-12d3-a456-426614174000' // sample UUID
    };
    
    // First creation should succeed
    try {
      const firstStream = await Stream.create(streamData);
      console.log('✓ First stream created successfully:', firstStream.id);
    } catch (error) {
      console.log('✗ Error creating first stream:', error.message);
      return;
    }
    
    // Second creation with same details should fail
    try {
      const secondStream = await Stream.create(streamData);
      console.log('✗ Second stream was created (should have been prevented)');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ Duplicate prevention working - second stream creation blocked');
      } else {
        console.log('✗ Unexpected error on second creation:', error.message);
      }
    }
    
    console.log('Duplicate prevention test completed.');
  } catch (error) {
    console.error('Error during duplicate prevention test:', error);
  }
}

// Run the test
testDuplicatePrevention().then(() => {
  console.log('Test completed.');
  process.exit(0);
});