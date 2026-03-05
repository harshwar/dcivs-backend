const EdgeTTS = require('node-edge-tts');

/**
 * Pro Neural TTS Proxy (node-edge-tts version)
 * More stable for 2026 Edge TTS protocols.
 */
async function tts(req, res) {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const text = req.query.text;
    if (!text) {
      return res.status(400).json({ error: 'Text query parameter is required' });
    }

    const voice = req.query.voice || 'en-US-AriaNeural';
    console.log(`[${requestId}] 🎙️ TTS Request (node-edge-tts): "${text.substring(0, 30)}..."`);

    const tts = new EdgeTTS();
    
    // node-edge-tts's ttsPromise returns the audio data as a Buffer
    // This is often more resilient than raw chunked streams for proxying
    const audioBuffer = await tts.ttsPromise(text, voice);

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Empty audio buffer received');
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    res.send(audioBuffer);
    
    console.log(`[${requestId}] ✅ Success: Sent ${audioBuffer.length} bytes`);
  } catch (err) {
    console.error(`[${requestId}] ❌ TTS Error:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to synthesize speech', 
        message: err.message 
      });
    }
  }
}

module.exports = {
  tts
};
