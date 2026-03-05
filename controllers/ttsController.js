const { EdgeTTS } = require('edge-tts-universal');

/**
 * Pro Neural TTS Proxy
 * Converts text to high-quality human-like speech using Microsoft Edge's Neural engine.
 */
async function tts(req, res) {
  try {
    const text = req.query.text;
    if (!text) {
      return res.status(400).json({ error: 'Text query parameter is required' });
    }

    // Initialize EdgeTTS
    const tts = new EdgeTTS();

    // Voice selection logic (Favoring smooth natural voices)
    // We allow passing a voice name if the frontend wants to experiment
    const voice = req.query.voice || 'en-US-AriaNeural';

    // Generate the audio stream
    console.log(`🎙️ Synthesizing: "${text.substring(0, 50)}..." [Voice: ${voice}]`);
    
    res.setHeader('Content-Type', 'audio/mpeg');

    let chunkCount = 0;
    let byteCount = 0;
    
    for await (const chunk of tts.synthesizeStream(text, voice)) {
      if (chunk.type === 'audio') {
        res.write(chunk.data);
        byteCount += chunk.data.length;
        chunkCount++;
      }
    }
    
    console.log(`✅ TTS Stream Complete. Sent ${chunkCount} chunks (${byteCount} bytes).`);
    res.end();
  } catch (err) {
    console.error('TTS Proxy Error:', err);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
}

module.exports = {
  tts
};
