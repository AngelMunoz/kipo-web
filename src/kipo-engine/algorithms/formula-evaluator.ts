import type { DerivedStats } from '../domain/entity';
import type { MathExpr, VarId } from '../domain/skill';

function getValue(stats: DerivedStats, varId: VarId): number {
  switch (varId) {
    case 'AP': return stats.AP;
    case 'AC': return stats.AC;
    case 'DX': return stats.DX;
    case 'MP': return stats.MP;
    case 'MA': return stats.MA;
    case 'MD': return stats.MD;
    case 'WT': return stats.WT;
    case 'DA': return stats.DA;
    case 'LK': return stats.LK;
    case 'HP': return stats.HP;
    case 'DP': return stats.DP;
    case 'HV': return stats.HV;
    case 'Fire':
      return stats.ElementAttributes.get('Fire') ?? 0;
    case 'Water':
      return stats.ElementAttributes.get('Water') ?? 0;
    case 'Earth':
      return stats.ElementAttributes.get('Earth') ?? 0;
    case 'Air':
      return stats.ElementAttributes.get('Air') ?? 0;
    case 'Lightning':
      return stats.ElementAttributes.get('Lightning') ?? 0;
    case 'Light':
      return stats.ElementAttributes.get('Light') ?? 0;
    case 'Dark':
      return stats.ElementAttributes.get('Dark') ?? 0;
    // Resistances are defender stats, not used in raw damage calculation.
    case 'FireRes':
    case 'WaterRes':
    case 'EarthRes':
    case 'AirRes':
    case 'LightningRes':
    case 'LightRes':
    case 'DarkRes':
      return 0;
    default:
      if (typeof varId === 'object' && varId.kind === 'Unknown') {
        return 0;
      }
      return 0;
  }
}

function evaluateExpr(stats: DerivedStats, expr: MathExpr): number {
  switch (expr.kind) {
    case 'Const':
      return expr.value;
    case 'Var':
      return getValue(stats, expr.id);
    case 'Add':
      return evaluateExpr(stats, expr.left) + evaluateExpr(stats, expr.right);
    case 'Sub':
      return evaluateExpr(stats, expr.left) - evaluateExpr(stats, expr.right);
    case 'Mul':
      return evaluateExpr(stats, expr.left) * evaluateExpr(stats, expr.right);
    case 'Div': {
      const denominator = evaluateExpr(stats, expr.right);
      if (denominator === 0) return 0;
      return evaluateExpr(stats, expr.left) / denominator;
    }
    case 'Pow':
      return Math.pow(evaluateExpr(stats, expr.left), evaluateExpr(stats, expr.right));
    case 'Log':
      return Math.log(evaluateExpr(stats, expr.expr));
    case 'Log10':
      return Math.log10(evaluateExpr(stats, expr.expr));
    default:
      return 0;
  }
}

export function evaluate(stats: DerivedStats, expr: MathExpr): number {
  return evaluateExpr(stats, expr);
}
