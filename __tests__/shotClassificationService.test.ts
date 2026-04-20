import { describe, expect, it } from 'vitest';
import { classifyShot } from '../services/shotClassificationService';

describe('classifyShot', () => {
  it('rounds values to nearest integer within range', () => {
    expect(
      classifyShot({
        face: 1.6,
        path: -2.4,
        attack: 3.5,
      })
    ).toEqual({
      face: 2,
      path: -2,
      attack: 4,
    });
  });

  it('clamps face/path to [-4, 4] and attack to [-7, 7]', () => {
    expect(
      classifyShot({
        face: 10.2,
        path: -9.7,
        attack: 100,
      })
    ).toEqual({
      face: 4,
      path: -4,
      attack: 7,
    });

    expect(
      classifyShot({
        face: -10.2,
        path: 9.7,
        attack: -100,
      })
    ).toEqual({
      face: -4,
      path: 4,
      attack: -7,
    });
  });
});
