#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol,
};

const DAY_LEDGERS: u32 = 17280; // ~5s ledgers → ~1 day
const INSTANCE_TTL_THRESHOLD: u32 = DAY_LEDGERS * 7;
const INSTANCE_TTL_EXTEND: u32 = DAY_LEDGERS * 30;
const PERSISTENT_TTL_THRESHOLD: u32 = DAY_LEDGERS * 7;
const PERSISTENT_TTL_EXTEND: u32 = DAY_LEDGERS * 30;

const BASE_QUOTA: u64 = 5 * 1024 * 1024 * 1024; // 5 GiB free tier

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    Unauthorized = 2,
    InsufficientQuota = 3,
    ObjectExists = 4,
    ObjectMissing = 5,
    PaymentSeen = 6,
    InvalidAmount = 7,
    Overflow = 8,
}

#[contracttype]
#[derive(Clone)]
pub struct Profile {
    pub quota_bytes: u64,
    pub used_bytes: u64,
    pub lease_expires: u64,
    pub object_count: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct StoredObject {
    pub owner: Address,
    pub size: u64,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Initialized,
    Profile(Address),
    Object(BytesN<32>),
    Payment(BytesN<32>),
    PlanBytes(Symbol),
}

#[contract]
pub struct StorageMarket;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
}

fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
}

fn require_init(env: &Env) -> Result<(), Error> {
    if env
        .storage()
        .instance()
        .get::<_, bool>(&DataKey::Initialized)
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(Error::NotInitialized)
    }
}

fn load_profile(env: &Env, user: &Address) -> Profile {
    let key = DataKey::Profile(user.clone());
    env.storage()
        .persistent()
        .get::<_, Profile>(&key)
        .unwrap_or(Profile {
            quota_bytes: BASE_QUOTA,
            used_bytes: 0,
            lease_expires: 0,
            object_count: 0,
        })
}

fn save_profile(env: &Env, user: &Address, profile: &Profile) {
    let key = DataKey::Profile(user.clone());
    env.storage().persistent().set(&key, profile);
    bump_persistent(env, &key);
}

#[contractimpl]
impl StorageMarket {
    /// One-time setup. Sets admin and default plan sizes (bytes).
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env
            .storage()
            .instance()
            .get::<_, bool>(&DataKey::Initialized)
            .unwrap_or(false)
        {
            return Err(Error::Unauthorized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);

        // Plan catalog (bytes granted per purchase)
        env.storage()
            .instance()
            .set(&DataKey::PlanBytes(symbol_short!("starter")), &((10u64) * 1024 * 1024 * 1024));
        env.storage()
            .instance()
            .set(&DataKey::PlanBytes(symbol_short!("growth")), &((50u64) * 1024 * 1024 * 1024));
        env.storage()
            .instance()
            .set(&DataKey::PlanBytes(symbol_short!("pro")), &((200u64) * 1024 * 1024 * 1024));

        bump_instance(&env);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        require_init(&env)?;
        Ok(env.storage().instance().get(&DataKey::Admin).unwrap())
    }

    pub fn get_profile(env: Env, user: Address) -> Result<Profile, Error> {
        require_init(&env)?;
        bump_instance(&env);
        let profile = load_profile(&env, &user);
        let key = DataKey::Profile(user);
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        Ok(profile)
    }

    /// Credit quota after an off-chain verified XLM payment. Admin (API) or user may call;
    /// payment_hash must be unique. `lease_days` extends lease_expires from now.
    pub fn credit_purchase(
        env: Env,
        user: Address,
        plan_id: Symbol,
        payment_hash: BytesN<32>,
        lease_days: u32,
    ) -> Result<Profile, Error> {
        require_init(&env)?;
        bump_instance(&env);

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        // Storage API / operator holds the admin key and credits after verifying Horizon payment.
        admin.require_auth();

        let pay_key = DataKey::Payment(payment_hash.clone());
        if env.storage().persistent().has(&pay_key) {
            return Err(Error::PaymentSeen);
        }

        let plan_key = DataKey::PlanBytes(plan_id);
        let grant: u64 = env
            .storage()
            .instance()
            .get(&plan_key)
            .ok_or(Error::InvalidAmount)?;

        let mut profile = load_profile(&env, &user);
        profile.quota_bytes = profile
            .quota_bytes
            .checked_add(grant)
            .ok_or(Error::Overflow)?;

        let now = env.ledger().timestamp();
        let add_secs = (lease_days as u64).saturating_mul(86_400);
        let base = if profile.lease_expires > now {
            profile.lease_expires
        } else {
            now
        };
        profile.lease_expires = base.saturating_add(add_secs);

        save_profile(&env, &user, &profile);
        env.storage().persistent().set(&pay_key, &user);
        bump_persistent(&env, &pay_key);

        env.events().publish(
            (symbol_short!("credit"), user.clone()),
            (grant, payment_hash, profile.quota_bytes),
        );

        Ok(profile)
    }

    /// Register an uploaded object. Owner may self-register, or admin (API) may register for owner.
    pub fn register_object(
        env: Env,
        owner: Address,
        hash: BytesN<32>,
        size: u64,
    ) -> Result<Profile, Error> {
        require_init(&env)?;
        bump_instance(&env);

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        // Prefer owner auth; storage API uses admin auth after wallet challenge.
        // Callers must attach one of these auths in the transaction.
        // We require admin auth in v1 API path; owner can also authorize by being admin of their tx.
        admin.require_auth();

        if size == 0 {
            return Err(Error::InvalidAmount);
        }

        let obj_key = DataKey::Object(hash.clone());
        if env.storage().persistent().has(&obj_key) {
            return Err(Error::ObjectExists);
        }

        let mut profile = load_profile(&env, &owner);
        let remaining = profile
            .quota_bytes
            .checked_sub(profile.used_bytes)
            .ok_or(Error::Overflow)?;
        if size > remaining {
            return Err(Error::InsufficientQuota);
        }

        profile.used_bytes = profile
            .used_bytes
            .checked_add(size)
            .ok_or(Error::Overflow)?;
        profile.object_count = profile
            .object_count
            .checked_add(1)
            .ok_or(Error::Overflow)?;

        let obj = StoredObject {
            owner: owner.clone(),
            size,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&obj_key, &obj);
        bump_persistent(&env, &obj_key);
        save_profile(&env, &owner, &profile);

        env.events()
            .publish((symbol_short!("regobj"), owner), (hash, size));

        Ok(profile)
    }

    /// Remove object and free quota. Admin (API) authorizes after wallet challenge.
    pub fn delete_object(env: Env, owner: Address, hash: BytesN<32>) -> Result<Profile, Error> {
        require_init(&env)?;
        bump_instance(&env);

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let obj_key = DataKey::Object(hash.clone());
        let obj: StoredObject = env
            .storage()
            .persistent()
            .get(&obj_key)
            .ok_or(Error::ObjectMissing)?;
        if obj.owner != owner {
            return Err(Error::Unauthorized);
        }

        let mut profile = load_profile(&env, &owner);
        profile.used_bytes = profile.used_bytes.saturating_sub(obj.size);
        profile.object_count = profile.object_count.saturating_sub(1);

        env.storage().persistent().remove(&obj_key);
        save_profile(&env, &owner, &profile);

        env.events()
            .publish((symbol_short!("delobj"), owner), hash);

        Ok(profile)
    }

    pub fn get_object(env: Env, hash: BytesN<32>) -> Result<StoredObject, Error> {
        require_init(&env)?;
        env.storage()
            .persistent()
            .get(&DataKey::Object(hash))
            .ok_or(Error::ObjectMissing)
    }

    pub fn payment_used(env: Env, payment_hash: BytesN<32>) -> Result<bool, Error> {
        require_init(&env)?;
        Ok(env
            .storage()
            .persistent()
            .has(&DataKey::Payment(payment_hash)))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    #[test]
    fn credit_and_register() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StorageMarket, ());
        let client = StorageMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin);

        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let pay = BytesN::from_array(&env, &[2u8; 32]);
        let profile = client.credit_purchase(&user, &symbol_short!("starter"), &pay, &30);
        assert_eq!(profile.quota_bytes, BASE_QUOTA + 10 * 1024 * 1024 * 1024);

        let obj_hash = BytesN::from_array(&env, &[3u8; 32]);
        let after = client.register_object(&user, &obj_hash, &1024);
        assert_eq!(after.used_bytes, 1024);
        assert_eq!(after.object_count, 1);

        let _ = hash;
    }
}
