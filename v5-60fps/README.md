# v5-60fps

Same site as the root, with the judder fix. Open `index.html`.

The root plays a 24fps file at `playbackRate = 2`, which puts 48 frames on a
60Hz screen's 60 refreshes — held 2,1,1,1,2,1,1,1…, which reads as constant
micro-judder no matter how the player is written.

Here the speed is baked into the file instead: 24fps x 2.5 is exactly 60fps, so
every one of the 949 frames is kept and each lands on exactly one refresh, at
`playbackRate` 1.0 (the browser's fast decode path).

|                   | root            | this folder     |
| ----------------- | --------------- | --------------- |
| file              | 24fps, 39.5s    | 60fps, 15.8s    |
| speed             | playbackRate 2  | baked in, 1.0   |
| keyframe interval | 250 frames      | 15 frames       |
| worst-case seek   | decode 250      | decode 15       |
| size              | 3.94 MB         | 4.35 MB         |

Beat marks in `app.js` are still written in the **original take's seconds** —
`SPEED = 2.5` converts them once at load, so the numbers stay the ones measured
off the footage.

Re-encoded with:

    ffmpeg -i video.mp4 -an -vf "setpts=PTS/2.5" -r 60 \
      -c:v libx264 -crf 23 -g 15 -preset slow -pix_fmt yuv420p \
      -movflags +faststart out.mp4
