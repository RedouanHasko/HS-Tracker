import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSpeakableAssistantText,
  isSpeechSynthesisSupported,
  isVoiceInputSupported,
  mergeSpeechResult,
  recognitionLocale,
  stripMarkdownForSpeech,
} from '../src/utils/voice';

test('recognition locales match the widest-supported variants', () => {
  assert.equal(recognitionLocale('en'), 'en-US');
  assert.equal(recognitionLocale('fr'), 'fr-FR');
  assert.equal(recognitionLocale('ar'), 'ar-SA');
});

test('speech result merging reads final and interim from the event alone', () => {
  const merged = mergeSpeechResult({
    results: [{ 0: { transcript: 'hello', isFinal: true }, length: 1 }],
  } as never);
  assert.equal(merged.finalText, 'hello ');
  assert.equal(merged.display, 'hello');
  // A later event carries the full session: settled final plus fresh interim.
  const continued = mergeSpeechResult({
    results: [
      { 0: { transcript: 'hello', isFinal: true }, length: 1 },
      { 0: { transcript: 'world', isFinal: false }, length: 1 },
    ],
  } as never);
  assert.equal(continued.finalText, 'hello ');
  assert.equal(continued.display, 'hello world');
});

test('chat markdown is stripped for natural speech', () => {
  assert.equal(stripMarkdownForSpeech('**Budget** is 100 DH'), 'Budget is 100 DH');
  assert.equal(stripMarkdownForSpeech('`code` and [link](http://x)'), 'code and link');
  assert.equal(stripMarkdownForSpeech('- a\n- b'), 'a\nb');
  assert.equal(stripMarkdownForSpeech('## Title\nBody'), 'Title\nBody');
});

test('status beeps are never read aloud, real replies are', () => {
  assert.equal(isSpeakableAssistantText('⚠ Mic blocked'), false);
  assert.equal(isSpeakableAssistantText('✓ Changes applied'), false);
  assert.equal(isSpeakableAssistantText('↩ Undo applied'), false);
  assert.equal(isSpeakableAssistantText('  '), false);
  assert.equal(isSpeakableAssistantText('Added the expense for 120 DH.'), true);
});

test('browser voice APIs report unsupported outside a browser', () => {
  assert.equal(isVoiceInputSupported(), false);
  assert.equal(isSpeechSynthesisSupported(), false);
});
