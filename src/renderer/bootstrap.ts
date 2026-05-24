import type { MutableWorld, World } from '../kipo-engine/domain/world';
import type { PomoEnvironment, CoreServices, StoreServices, GameplayServices } from '../kipo-engine/systems/environment';
import type { IStateWriteService } from '../kipo-engine/systems/state-write';
import { createStateWriteService } from '../kipo-engine/systems/state-write';
import { createEventBus, type EventBus } from '../kipo-engine/events/event-bus';
import { createMutableWorld, createWorldView } from '../kipo-engine/state/mutable-world';
import { loadContent, type ContentStores } from '../kipo-engine/stores/content-store';
import { loadParticleStore, type ParticleStore } from './stores/particle-store';
import { createGameplayLoop, type GameplayLoop } from '../kipo-engine/gameplay-loop';
import { createMovementSystem } from '../kipo-engine/systems/movement';
import { createAbilityActivationSystem } from '../kipo-engine/systems/ability-activation';
import { createTargetingSystem as createEngineTargetingSystem } from '../kipo-engine/systems/targeting';
import { createProjectileSystem } from '../kipo-engine/systems/projectile';
import { createNotificationSystem } from '../kipo-engine/systems/notification';
import { createResourceManagerSystem } from '../kipo-engine/systems/resource-manager';
import { createNavigationSystem } from '../kipo-engine/systems/navigation';
import type { ProjectionService, CameraService } from '../kipo-engine/systems/environment';
import type { ScenarioId } from '../kipo-engine/types/branded';
import { computeMovementSnapshot, getNearbyEntitiesSnapshot, calculateDerivedStatsForEntity } from '../kipo-engine/state/projections';

function createProjectionService(world: MutableWorld): ProjectionService {
    return {
        computeMovementSnapshot(scenarioId) {
            return computeMovementSnapshot(
                0,
                world.Positions,
                world.Velocities,
                world.Rotations,
                world.ModelConfigId,
                world.EntityScenario,
                scenarioId as ScenarioId,
            );
        },
        getNearbyEntitiesSnapshot,
        calculateDerivedStats: (w, itemStore, entityId) => calculateDerivedStatsForEntity(w, itemStore, entityId),
    };
}

function createCameraService(): CameraService {
    return {
        getAllCameras: () => [{ position: { X: 0, Y: 0 }, viewport: { width: 800, height: 600 }, zoom: 1 }]
    };
}

export interface GameBootstrap {
    world: MutableWorld;
    worldView: World;
    eventBus: EventBus;
    stateWrite: IStateWriteService;
    contentStores: ContentStores;
    particleStore: ParticleStore;
    gameplayLoop: GameplayLoop;
    env: PomoEnvironment;
}

export async function bootstrapGame(): Promise<GameBootstrap> {
    const stateWrite = createStateWriteService();
    const eventBus = createEventBus();
    const mutableWorld = createMutableWorld();
    const worldView = createWorldView(mutableWorld);
    
    const [contentStores, particleStore] = await Promise.all([
        loadContent('/kipo-content'),
        loadParticleStore('/kipo-content')
    ]);

    const core: CoreServices = {
        eventBus,
        world: mutableWorld,
        worldView,
        stateWrite,
        rng: { 
            next: Math.random, 
            nextInt: (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min
        }
    };

    const stores: StoreServices = {
        skillStore: contentStores.SkillStore,
        itemStore: contentStores.ItemStore,
        aiArchetypeStore: contentStores.AIArchetypeStore,
        aiEntityStore: contentStores.AIEntityStore,
        aiFamilyStore: contentStores.AIFamilyStore,
        decisionTreeStore: contentStores.DecisionTreeStore,
        mapEntityGroupStore: contentStores.MapEntityGroupStore
    };

    const gameplay: GameplayServices = {
        projections: createProjectionService(mutableWorld),
        cameraService: createCameraService()
    };

    const env: PomoEnvironment = {
        core,
        stores,
        gameplay
    };

    const abilityActivation = createAbilityActivationSystem(env);
    createEngineTargetingSystem(env);

    const movement = createMovementSystem(env);
    const projectile = createProjectileSystem(env);
    const notification = createNotificationSystem(env);
    const resourceManager = createResourceManagerSystem(env);
    createNavigationSystem(env);

    const [
        { createCombatSystem },
        { createEntitySpawnerSystem },
        { createEffectApplicationSystem },
        { createInventorySystem },
    ] = await Promise.all([
        import('../kipo-engine/systems/combat'),
        import('../kipo-engine/systems/entity-spawner'),
        import('../kipo-engine/systems/effect-application'),
        import('../kipo-engine/systems/inventory'),
    ]);

    const combat = createCombatSystem(env);
    const entitySpawner = createEntitySpawnerSystem(env);
    const effectApp = createEffectApplicationSystem(env);
    const inventorySystem = createInventorySystem(env);

    const { createAISystem } = await import('../kipo-engine/systems/ai-system');
    const aiSystem = createAISystem(env);

    const equipmentSystem = {
        update: () => {},
        dispose: () => {}
    };

    const gameplayLoop = createGameplayLoop(env, {
        abilityActivation,
        combat,
        effectApp,
        projectile,
        movement,
        ai: aiSystem,
        resourceManager,
        inventory: inventorySystem,
        equipment: equipmentSystem,
        entitySpawner,
        notification
    });

    return {
        world: mutableWorld,
        worldView,
        eventBus,
        stateWrite,
        contentStores,
        particleStore,
        gameplayLoop,
        env
    };
}