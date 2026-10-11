# MediaPipe Tasks Vision (přiložená knihovna)

Hra používá knihovnu **MediaPipe Tasks Vision 0.10.14** (Google) k rozpoznání postavy
z webkamery při počítání dřepů ve světě GSPORT. Obraz se zpracovává jen v prohlížeči hráče.

- Zdroj knihovny: npm balíček `@mediapipe/tasks-vision@0.10.14`
  (`vision_bundle.mjs`, `wasm/`), <https://github.com/google-ai-edge/mediapipe>
- Model: `pose_landmarker_lite.task` (float16, verze 1),
  <https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task>
- Licence: **Apache License 2.0** – plné znění v souboru [LICENSE](LICENSE).

Soubory jsou beze změn. Knihovna se načítá až ve chvíli, kdy hráč zapne kameru.
