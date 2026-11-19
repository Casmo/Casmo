# Animated WebP at 60fps for game Clips

Game Clips in the profile README are animated WebP files (about 320px wide, 3–5 s loops, under 2 MB each), committed to `images/`, not GIFs. Mathieu wants at least 60fps. GIF can't do that: frame delays come in 1/100 s steps and browsers clamp delays under 20ms to 100ms, so 50fps is the real maximum. Real video (MP4) only plays in a GitHub README when it is uploaded by hand as a github.com user-attachment, which can't be automated. Animated WebP plays at 60fps in current browsers, and GitHub serves it like any other image.

## Considered Options

- GIF at 50fps: works everywhere, but misses the 60fps requirement and the files are bigger.
- MP4 through user-attachments: real video, but each update needs a manual upload.
