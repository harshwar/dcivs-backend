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
    // edge-tts-universal returns an array of Uint8Arrays in its generator
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of tts.synthesizeStream(text, voice)) {
      res.write(chunk);
    }
    
    res.end();
  } catch (err) {
    console.error('TTS Proxy Error:', err);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
}

module.exports = {
  tts
};
