function assert(condition: boolean, str: string) {
 if (!condition) {
   throw new Error(str);
 }
}
 
function getAmountOut(amountIn: number, reserveIn: number, reserveOut: number, fee: number) {
   let amountInWithFee = amountIn * (1/* - fee*/);
   let numerator = amountInWithFee * reserveOut;
   let denominator = (reserveIn * 1) + amountInWithFee;
   let amountOut = numerator / denominator;
   return amountOut;
}
 
 
function getAmountOutNoFee(amountIn: number, reserveIn: number, reserveOut: number) {
   return (amountIn * reserveOut) / (reserveIn + amountIn);
}
 
class AMM {
   name: string;
 
   F: number;
   x: number;
   y: number;
   vx: number;
   vy: number;
   fee: number;
 
   totalSupply: number;
 
   POOL_TOKEN_BASE: number = 1000;
 
   constructor(name: string, F: number) {
       this.name = name;
 
       this.F = F; // amplification factor
 
       this.x = 0; // actual balances
       this.y = 0;
 
       this.vx = 0; // virtual balances
       this.vy = 0;
 
       this.fee = 0;
 
       this.totalSupply = 0;
   }
 
   setVirtualBalances(vx: number, vy: number) {
       this.vx = vx;
       this.vy = vy;
   }
 
   addBalances(amountX: number, amountY: number) {
       this.x += amountX;
       this.y += amountY;
   }
 
   join(amountX: number, amountY: number) {
       console.log("joinX: " + amountX);
       console.log("joinY: " + amountY);
 
       if (this.vx > 0 && this.vy > 0) {
           assert(Math.abs(this.vx/this.vy - amountX/amountY) < 0.01, "ratio invalid");
       }
 
       let mintAmount = Math.sqrt(amountX*amountY);
      
       this.vx += amountX;
       this.vy += amountY;
 
       this.x += amountX;
       this.y += amountY;
      
       return mintAmount;
   }
 
   exit(burnAmount: number) {
       console.log("burnAmount: " + burnAmount);
       //console.log("totalSupply: " + this.totalSupply);
 
       const amountX = Math.sqrt(burnAmount * burnAmount * (this.vx/this.vy));
       const amountY = Math.sqrt(burnAmount * burnAmount * (this.vy/this.vx));
 
       // Math.sqrt(amountX * amountY) = burnAmount
       // amountX * amountY = burnAmount * burnAmount
       // amountY/amountX = this.vy/this.vx
       // amountY = amountX*this.vy/this.vx
       // amountX*amountX*this.vy/this.vx = burnAmount * burnAmount
       // amountX*amountX = burnAmount * burnAmount * (this.vx/this.vy)
       // amountX = sqrt(burnAmount * burnAmount * (this.vx/this.vy))
 
       console.log("exitX: " + amountX);
       console.log("exitY: " + amountY);
 
       this.x -= amountX;
       this.y -= amountY;
 
       this.vx -= amountX;
       this.vy -= amountY;
 
       return [amountX, amountY];
   }
 
   buyY(amountIn: number) {
       let amountOut = getAmountOut(amountIn, this.vx, this.vy, this.fee);
       this.vx += amountIn;
       this.vy -= amountOut;
       this.x += amountIn;
       this.y -= amountOut;
       assert(this.x >= 0 && this.y >= 0, "out of bounds");
       return [amountIn, amountOut];
   }
 
   buyX(amountIn: number) {
       //let amountOut = getAmountOut(amountIn, this.vy, this.vx, this.fee);
       let amountOut = getAmountOutNoFee(amountIn, this.vy, this.vx);
       this.vy += amountIn;
       this.vx -= amountOut;
       this.y += amountIn;
       this.x -= amountOut;
       assert(this.x >= 0 && this.y >= 0, "out of bounds");
       return [amountIn, amountOut];
   }
 
   toString() {
       return `${this.name}\nvx = ${this.vx}\nvy = ${this.vy}\nx = ${this.x}\ny = ${this.y}\np = ${this.price()}\nsupply = ${this.totalSupply}\nkb = ${this.kb()}\nk = ${this.k()}\n`;
   }
 
   k() {
       return this.vx * this.vy;
   }
 
   kb() {
       return this.x * this.y;
   }
 
   price() {
       return this.vy/this.vx;
   }
 
   ratio() {
       return this.y/this.x;
   }
}
 
function transfer(from: AMM, to: AMM, amountX: number, amountY: number) {
 from.addBalances(-amountX, -amountY);
 to.addBalances(amountX, amountY);
}
 
function transferAllBack(from: AMM, to: AMM) {
   transfer(from, to, from.x, from.y);
}
 
// https://pintail.medium.com/uniswap-a-good-deal-for-liquidity-providers-104c0b6816f2
function calcUniswapIL(priceRatio: number) {
   return 2 * Math.sqrt(priceRatio) / (1+priceRatio) - 1;
}
 
function calcUniswapV3IL(price: number, lower: number, upper: number, entry: number) {
   return (2 * Math.sqrt(price) - (price/Math.sqrt(upper)) - Math.sqrt(lower)) / ((price/Math.sqrt(entry)) - (price/Math.sqrt(upper)) + Math.sqrt(entry) - Math.sqrt(lower)) - 1;
}
 
function calcAmplifiedIL(AF: number, priceRatio: number) {
   return AF * calcUniswapIL(priceRatio);
}
 
class AmmState {
 name: string = "";
 
 sqrtK: number = 0;
 
 x: number = 0;
 y: number = 0;
 
 totalSupply: number = 0;
 
 previousSyncPointIdx: number = 0;
 nextMinSyncPointIdx: number = 0;
 
 previousDeltaK: number = 0;
}
 
class SyncPoint {
 timestamp: number = 0;
 sqrtK: number = 0;
}
 
class DAMM {
 
   name: string;
 
   x: number;
   y: number;
 
   totalSupply: number;
 
   MIN_HEALTH_FACTOR: number = 0.9;
 
   MAX_HEALTH_FACTOR_DETORIATION_PER_AMM_PER_DAY: number = 0.01;
 
   amms: AmmState[] = [];
   syncPoints: SyncPoint[] = [];
 
   constructor(name: string) {
       this.name = name;
       this.x = 0;
       this.y = 0;
       this.totalSupply = 0;
 
       this.syncPoints.push({
           timestamp: 0,
           sqrtK: 0
       });
   }
 
   addAMM(amm: AMM) {
       const ammState: AmmState = {
           name: amm.name,
           sqrtK: 0,
           x: amm.x,
           y: amm.y,
           totalSupply: 0,
           previousSyncPointIdx: 0,
           nextMinSyncPointIdx: 0,
           previousDeltaK: 0
       };
       this.amms.push(ammState);
   }
 
   syncAMM(amm: AMM, syncPointIdx: number, extraAmountX: number = 0, extraAmountY: number = 0) {
       const ammState = this.getAMM(amm.name);
       assert(ammState !== undefined, "AMM not found");
       if (ammState === undefined) return;
 
       const healthFactorBefore = this.healthFactor();
 
       const currentSqrtK = Math.sqrt(amm.k());
 
       const currentSyncPoint = this.syncPoints[syncPointIdx];
       assert(currentSyncPoint.timestamp > 0 || currentSyncPoint.timestamp === 0, "sync point too old");
       assert(syncPointIdx >= ammState.nextMinSyncPointIdx, "invalid sync point");
 
       //console.log("syncPointIdx: " + syncPointIdx);
       //console.log("previousSyncPointIdx: " + ammState.previousSyncPointIdx);
       //console.log("nextMinSyncPointIdx: " + ammState.nextMinSyncPointIdx);
 
 
       // Calculate the new k
       const previousSyncPoint = this.syncPoints[ammState.previousSyncPointIdx];
       const newSqrtK = currentSqrtK + (currentSyncPoint.sqrtK - previousSyncPoint.sqrtK) - ammState.previousDeltaK;
 
       //console.log("currentSqrtK: " + currentSqrtK);
       //console.log("currentSyncPoint.sqrtK: " + currentSyncPoint.sqrtK);
       //console.log("previousSyncPoint.sqrtK: " + previousSyncPoint.sqrtK);
       //console.log("ammState.previousDeltaK: " + ammState.previousDeltaK);
       //console.log("previousDeltaK: " + ammState.previousDeltaK);
       //console.log("stateK     : " + ammState.sqrtK);
       //console.log("currentK   : " + currentSqrtK);
       //console.log("new localK : " + newSqrtK);
 
       // The difference in k caused by joins/exits done on L2 since the last sync
       const dSqrtK = currentSqrtK - ammState.sqrtK;
 
       // Calculate the new virtual balances for the AMM
       const amm_vx = amm.vx;
       const amm_vy = amm.vy;
       amm.vx = Math.sqrt(newSqrtK*newSqrtK * (amm_vx/amm_vy));
       amm.vy = Math.sqrt(newSqrtK*newSqrtK * (amm_vy/amm_vx));
       assert(Math.abs(amm.vx*amm.vy - newSqrtK*newSqrtK) < 1, "invalid new curve");
 
       // Keep track of global balance
       this.x += (amm.x - ammState.x);
       this.y += (amm.y - ammState.y);
 
       // Update the global AMM state
       const latestSyncPoint = this.syncPoints[this.syncPoints.length - 1];
       const newGlobalSqrtK = latestSyncPoint.sqrtK + dSqrtK;
       const globalSyncPoint: SyncPoint = {
           timestamp: this.syncPoints.length,
           sqrtK: newGlobalSqrtK
       };
       this.syncPoints.push(globalSyncPoint);
       this.totalSupply += dSqrtK;
       assert(this.totalSupply >= 0, "global totalSupply cannot be negative");
 
       //console.log("currrent globalK: " + latestSyncPoint.k);
       //console.log("new globalK     : " + newGlobalSqrtK);
 
       // Update AMM state
       ammState.previousDeltaK = dSqrtK;
       ammState.sqrtK = newSqrtK;
       ammState.previousSyncPointIdx = syncPointIdx;
       ammState.nextMinSyncPointIdx = this.syncPoints.length - 1;
       ammState.totalSupply += dSqrtK;
       ammState.x = amm.x;
       ammState.y = amm.y;
       assert(ammState.totalSupply >= 0, "amm totalSupply cannot be negative");
 
       // Transfer extra funds in to stabilize balance curve
       this.x += extraAmountX;
       this.y += extraAmountY;
 
       // Verify AMM health
       const healthFactorAfter = this.healthFactor();
       assert(healthFactorAfter >= this.MIN_HEALTH_FACTOR, "minimum health factor reached");
       if (healthFactorAfter < healthFactorBefore) {
           assert(healthFactorBefore - healthFactorAfter < this.MIN_HEALTH_FACTOR, "health factor reached");
       }
   }
 
   getAMM(name: string) {
       for (const amm of this.amms) {
           if (amm.name === name) {
               return amm;
           }
       }
       return undefined;
   }
 
   toString() {
       return `${this.name}\n,HF: ${this.healthFactor()}\n`;
   }
 
   k() {
       return this.x*this.y;
   }
 
   healthFactor() {
       return Math.sqrt(this.k()) / this.totalSupply;
   }
}
 
 
 
const swapAmount = 22.51;
 
const amountX = 100;
const amountY = 100;
 
const amountIn = 10;
 
 
 
let damm = new DAMM("DAMM");
 
let amm1 = new AMM("AMM1", 1)
damm.addAMM(amm1);
 
const lpA1 = amm1.join(amountX, amountY);
console.log(amm1.toString());
 
 
damm.syncAMM(amm1, 0);
console.log(damm.toString());
console.log(amm1.toString());
 
 
const lpA2 = amm1.join(amountX, amountY);
console.log(amm1.toString());
 
damm.syncAMM(amm1, 1);
console.log(damm.toString());
console.log(amm1.toString());
 
 
let amm2 = new AMM("AMM2", 1)
damm.addAMM(amm2);
 
const lpB1 = amm2.join(amountX, amountY);
console.log(amm2.toString());
 
damm.syncAMM(amm2, 2);
console.log(amm2.toString());
 
 
 
const lpA3 = amm1.exit(lpA1);
console.log(amm1.toString());
 
damm.syncAMM(amm1, 3);
console.log(damm.toString());
console.log(amm1.toString());
 
 
amm1.buyX(amountX * 0.1);
amm2.buyX(amountX * 0.1);
damm.syncAMM(amm1, 4);
console.log(damm.toString());
console.log(amm1.toString());
damm.syncAMM(amm2, 5, 2, 0);
console.log(damm.toString());
console.log(amm2.toString());
