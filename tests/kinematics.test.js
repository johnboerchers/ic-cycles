import test from "node:test";
import assert from "node:assert/strict";
import { RHO, xhat, thetaFromXhat, smoothstep } from "../site/js/core/kinematics.js";
import { fixture, assertClose } from "./helpers.js";

test("xhat every 15° matches the fixture", () => {
  assert.equal(RHO, fixture.kinematics.rho);
  assert.equal(fixture.kinematics.samples.length, 25);
  for (const { thetaDeg, theta, xhat: x } of fixture.kinematics.samples) {
    assertClose(theta, (thetaDeg * Math.PI) / 180, `theta ${thetaDeg}°`);
    assertClose(xhat(theta), x, `xhat(${thetaDeg}°)`);
  }
});

test("xhat: 0 at TDC, 1 at BDC, symmetric about BDC", () => {
  assert.equal(xhat(0), 0);
  assert.equal(xhat(Math.PI), 1);
  for (let deg = 5; deg < 180; deg += 5) {
    const th = (deg * Math.PI) / 180;
    assertClose(xhat(2 * Math.PI - th), xhat(th), `symmetry at ${deg}°`);
  }
});

test("required 7: thetaFromXhat(xhat(θ)) = θ on [0, π]", () => {
  for (let i = 0; i <= 360; i++) {
    const th = (i / 360) * Math.PI;
    const back = thetaFromXhat(xhat(th));
    assert.ok(Math.abs(back - th) <= 1e-9, `θ = ${th}: got ${back}`);
  }
  // the fixture samples past BDC come back on the down-stroke branch, 2π − θ
  for (const { thetaDeg, theta, xhat: x } of fixture.kinematics.samples) {
    const expected = thetaDeg <= 180 ? theta : 2 * Math.PI - theta;
    assert.ok(Math.abs(thetaFromXhat(x) - expected) <= 1e-7, `fixture ${thetaDeg}°`);
  }
});

test("thetaFromXhat clamps outside [0, 1]", () => {
  assert.equal(thetaFromXhat(-0.1), 0);
  assert.equal(thetaFromXhat(1.1), Math.PI);
});

test("smoothstep", () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assertClose(smoothstep(0.25), 0.15625, "smoothstep(0.25)");
});
