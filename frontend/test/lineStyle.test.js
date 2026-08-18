import { describe, it, expect } from 'vitest';
import {
  parseLineStyle,
  DEFAULT_LINE_STYLE,
  WEIGHT_MIN,
  WEIGHT_MAX,
  OPACITY_MIN,
  OPACITY_MAX,
} from '../src/lib/lineStyle.js';

describe('parseLineStyle', () => {
  it('returns the default when there is nothing stored', () => {
    expect(parseLineStyle(null)).toEqual(DEFAULT_LINE_STYLE);
    expect(parseLineStyle('')).toEqual(DEFAULT_LINE_STYLE);
  });

  it('returns the default for corrupted JSON', () => {
    expect(parseLineStyle('not json')).toEqual(DEFAULT_LINE_STYLE);
  });

  it('returns the default for a non-object or array value', () => {
    expect(parseLineStyle('42')).toEqual(DEFAULT_LINE_STYLE);
    expect(parseLineStyle('null')).toEqual(DEFAULT_LINE_STYLE);
    expect(parseLineStyle('[1,2,3]')).toEqual(DEFAULT_LINE_STYLE);
  });

  it('passes through a valid stored value', () => {
    const stored = JSON.stringify({ color: '#00ff00', weight: 5, opacity: 0.5 });
    expect(parseLineStyle(stored)).toEqual({ color: '#00ff00', weight: 5, opacity: 0.5 });
  });

  it('falls back to the default color when malformed', () => {
    expect(parseLineStyle(JSON.stringify({ color: 'not-a-hex-color' })).color).toBe(
      DEFAULT_LINE_STYLE.color,
    );
    expect(parseLineStyle(JSON.stringify({ color: 123 })).color).toBe(DEFAULT_LINE_STYLE.color);
  });

  it('clamps weight and opacity into range rather than rejecting them', () => {
    expect(parseLineStyle(JSON.stringify({ weight: 999 })).weight).toBe(WEIGHT_MAX);
    expect(parseLineStyle(JSON.stringify({ weight: -5 })).weight).toBe(WEIGHT_MIN);
    expect(parseLineStyle(JSON.stringify({ opacity: 5 })).opacity).toBe(OPACITY_MAX);
    expect(parseLineStyle(JSON.stringify({ opacity: -1 })).opacity).toBe(OPACITY_MIN);
  });

  it('falls back to defaults for non-numeric weight/opacity', () => {
    expect(parseLineStyle(JSON.stringify({ weight: 'wide' })).weight).toBe(
      DEFAULT_LINE_STYLE.weight,
    );
    expect(parseLineStyle(JSON.stringify({ opacity: null })).opacity).toBe(
      DEFAULT_LINE_STYLE.opacity,
    );
  });
});
