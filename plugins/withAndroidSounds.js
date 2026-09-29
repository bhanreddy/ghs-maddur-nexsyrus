const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo plugin to copy custom notification sounds from /assets/Sounds
 * into the Android native /res/raw directory during prebuild.
 * Android 9+ Notification Channels REQUIRE custom sounds to be accessible natively.
 */
module.exports = function withAndroidSounds(config) {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const resPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
            const soundsPath = path.join(projectRoot, 'assets', 'sounds');

            // Ensure the raw directory exists
            if (!fs.existsSync(resPath)) {
                fs.mkdirSync(resPath, { recursive: true });
            }

            const soundResources = new Set();

            // Copy all .wav and .mp3 files from assets/sounds to res/raw.
            // Android resource names must be lowercase a-z, 0-9, or underscore only.
            if (fs.existsSync(soundsPath)) {
                const files = fs.readdirSync(soundsPath);
                for (const file of files) {
                    if (file.endsWith('.wav') || file.endsWith('.mp3')) {
                        const src = path.join(soundsPath, file);
                        const safeName = file.toLowerCase().replace(/[^a-z0-9._]/g, '_');
                        const dst = path.join(resPath, safeName);
                        fs.copyFileSync(src, dst);
                        soundResources.add(`@raw/${path.parse(safeName).name}`);
                    }
                }
            }

            // Expo resolves channel sounds by name with Resources.getIdentifier().
            // Resource shrinking cannot see references supplied from JavaScript/FCM.
            const keepFile = path.join(resPath, 'schoolims_sounds_keep.xml');
            if (soundResources.size > 0) {
                const keepXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="${[...soundResources].sort().join(',')}" />\n`;
                fs.writeFileSync(keepFile, keepXml);
            } else if (fs.existsSync(keepFile)) {
                fs.unlinkSync(keepFile);
            }

            return config;
        },
    ]);
};
