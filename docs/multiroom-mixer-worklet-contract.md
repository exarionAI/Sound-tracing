# Multiroom Mixer Worklet Channel Contract

Date: 2026-07-07

This note documents the audio graph contract used by the Multi Room demo. It is
intended for future human and LLM-assisted development, because the same bug is
easy to reintroduce when "source count", "Web Audio channel count", and
"native render output channels" are treated as the same thing.

## Short Version

For a multi-source SoundTrace scene, use one mixer worklet for the scene.

Do not create one worklet per source, and do not split sources into groups of
two. The value `channels = 2` means the native renderer should produce stereo
output. It does not mean the mixer can only accept two sources.

The mixer worklet input is a single packed Web Audio bus:

```text
input channel 0 -> source 0, mono
input channel 1 -> source 1, mono
input channel 2 -> source 2, mono
input channel 3 -> source 3, mono
...
```

For four rooms, the Web Audio input bus must therefore have four discrete mono
channels. The native render output can still be stereo.

## Correct Mental Model

There are two different channel counts:

| Concept | Meaning | Multi Room value |
| --- | --- | --- |
| Source input channels | One packed mono channel per SoundTrace source | `sources.length` |
| Native render output channels | Speaker/binaural output rendered by STCore | `2` |

These must not be collapsed into one variable.

In the SDK wrapper, `createMixerWorkletNode(listener, sources, channels)` uses:

- `sources.length` as the native `sourceCount`
- `channels` as the native render/output channel count
- `node.channelCount = sources.length`
- `node.channelCountMode = "explicit"`
- `node.channelInterpretation = "discrete"`

That last group is the Web Audio side of the contract. It tells the browser that
the mixer worklet expects exactly one discrete mono input channel per source.

## What Went Wrong

The broken behavior was:

- north/Synth and east/Guitar were audible
- south/Drum and west/Bass were silent

That failure pattern was consistent with the Web Audio graph only delivering the
first two source channels into the mixer input bus. A temporary workaround split
the four sources into groups of two, but that was the wrong public contract: it
made SDK users think they must manually batch sources by output channel count.

The correct fix was to make the SDK wrapper expose the native mixer contract
properly:

```ts
node.channelCount = sources.length;
node.channelCountMode = "explicit";
node.channelInterpretation = "discrete";
```

After that fix, the demo can use one mixer worklet for all sources.

This is not a browser rule that says "put two sources in each worklet." It is a
SoundTrace mixer API rule: `channels = 2` is output stereo, while source count is
the number of packed mono input channels.

## Current Demo Graph

The Multi Room demo builds this graph:

```text
decoded track -> mono buffer -> lowpass filter -> gain -> ChannelMerger input N

ChannelMerger(sources.length)
  -> SoundTrace mixer AudioWorkletNode
  -> sound.output
  -> AudioContext.destination
```

Important details:

- `AudioContext.createChannelMerger(sources.length)` packs all sources into one
  bus.
- Each stem is decoded into a one-channel `AudioBuffer` before it reaches the
  merger.
- Each per-source filter and gain node is pinned to one explicit discrete
  channel.
- The demo passes all native SoundTrace sources to one SDK mixer worklet.
- The demo does not set `mixerWorklet.channelCount` manually; that belongs in
  the SDK wrapper.

Relevant demo code:

- `src/examples/audio/soundTraceSdkAudio.ts`
- `playPackedMultiroomTracks(...)`
- `decodeMixerInputTrack(...)`

Relevant SDK wrapper code:

- `soundtrace.js/src/facade/SoundTrace-audio.ts`
- `createMixerWorkletNode(...)`

## Mono And Stereo Asset Handling

For the mixer worklet, every source input must be mono.

Most real music stems and demo assets are likely to be stereo files. The demo
must not pass stereo buffers directly into the packed mixer bus, because a
stereo asset can occupy more than one channel and shift or hide later sources.

The current demo therefore decodes every track into a one-channel buffer:

- mono files are copied directly
- stereo or multichannel files are averaged into mono
- if averaging nearly cancels the signal, the strongest source channel is used
  instead
- the result is RMS-normalized to keep stems in a usable range

This keeps "one source equals one Web Audio channel" true even when the source
file on disk is stereo.

## Rules For Future Changes

Keep these rules when changing Multi Room or adding another multi-source demo:

1. Use one mixer worklet per SoundTrace multi-source scene.
2. Pass every native source to `createMixerWorkletNode(...)`.
3. Treat `channels = 2` as stereo render output, not as source capacity.
4. Build one `ChannelMergerNode` with `sources.length` inputs.
5. Downmix every asset to mono before connecting it to the merger.
6. Use `channelCountMode = "explicit"` and `channelInterpretation = "discrete"`
   for packed source channels.
7. Do not split sources into pairs unless implementing a deliberate separate
   scene/mixer design.
8. Do not move mixer input-channel setup out of the SDK wrapper into each demo.

## Regression Coverage

The SDK wrapper has a regression test for this exact contract:

```text
soundtrace.js/tests/soundtrace-mixer-worklet.test.mjs
```

The test creates five fake sources and verifies:

- the native call receives `sourceCount = 5`
- the native call receives `channels = 2`
- the source ID array contains all five sources in order
- the returned Web Audio node gets `channelCount = 5`
- the returned node uses explicit discrete channel interpretation

If that test fails, the mixer contract is probably being broken again.

## Troubleshooting Checklist

If only the first one or two rooms are audible:

- check `createMixerWorkletNode(...)` in the SDK wrapper first
- confirm `node.channelCount === sources.length`
- confirm `channelCountMode === "explicit"`
- confirm `channelInterpretation === "discrete"`
- confirm the demo creates one `ChannelMergerNode` with `sources.length` inputs
- confirm every decoded asset has exactly one channel before it reaches the
  merger
- confirm the demo is not splitting sources into groups of two

If no sound is audible:

- confirm the AudioContext has been resumed by a user gesture
- confirm the SDK backend loaded the expected runtime
- confirm `sound.update(...)` succeeds after the sources and listener are set
- check browser console errors from the worklet and WASM runtime

If a stereo asset becomes very quiet after downmixing:

- inspect whether left and right channels are phase-opposed
- use strongest-channel fallback or asset-specific mono preparation
- keep the final buffer mono before it reaches the merger

