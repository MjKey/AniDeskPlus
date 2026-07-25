<script>
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import { DefaultResult, LoginResult, RegisterResult, RegisterVerifyResult } from "anixartjs";
    import MetaInfo from "../components/gui/MetaInfo.svelte";
    import BaseMainButton from "../components/buttons/BaseMainButton.svelte";
    import { fade } from "svelte/transition";
    import { onDestroy } from "svelte";
    let u;

    const user = localStorageWritable("user_token", null);
    const unsubUser = user.subscribe((value) => (u = value));

    let activeTab = "login"; // "login" | "register"
    let registerStep = 1; // 1: form, 2: verify code

    let lastError = null;
    let isLoading = false;
    let errorTimeout = null;

    onDestroy(() => {
        if (unsubUser) unsubUser();
        if (errorTimeout) clearTimeout(errorTimeout);
    });

    let loginVal = "";
    let passwordVal = "";
    let emailVal = "";
    let confirmPasswordVal = "";
    let codeVal = "";
    let registerHash = "";

    function setError(error) {
        lastError = error;
        if (errorTimeout) clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => {
            lastError = null;
        }, 5000);
    }

    async function login() {
        if (!loginVal || !passwordVal) {
            setError("Заполните все поля!");
            return;
        }

        isLoading = true;
        lastError = null;

        try {
            const res = await anixApi.auth.signIn({
                login: loginVal,
                password: passwordVal,
            });

            switch (res.code) {
                case DefaultResult.Ok:
                    user.set(
                        JSON.stringify({
                            id: res.profile.id,
                            token: res.profileToken.token,
                        }),
                    );
                    location.reload();
                    if (window.analytics) analytics.trackEvent("new_login");
                    break;
                case LoginResult.InvalidLogin:
                    setError("Неверный логин!");
                    break;
                case LoginResult.InvalidPassword:
                    setError("Неверный пароль!");
                    break;
                default:
                    setError(res.message || "Ошибка при входе!");
                    break;
            }
        } catch (e) {
            setError(e.message || "Произошла ошибка при соединении с сервером");
        } finally {
            isLoading = false;
        }
    }

    async function handleSignUp() {
        if (!emailVal || !loginVal || !passwordVal || !confirmPasswordVal) {
            setError("Заполните все поля!");
            return;
        }

        if (passwordVal !== confirmPasswordVal) {
            setError("Пароли не совпадают!");
            return;
        }

        if (passwordVal.length < 6) {
            setError("Пароль должен быть не менее 6 символов!");
            return;
        }

        isLoading = true;
        lastError = null;

        try {
            const res = await anixApi.auth.signUp({
                email: emailVal,
                login: loginVal,
                password: passwordVal,
            });

            if (res.code === DefaultResult.Ok || res.code === 0) {
                registerHash = res.hash;
                registerStep = 2;
            } else {
                switch (res.code) {
                    case RegisterResult.InvalidLogin:
                        setError("Недопустимый логин!");
                        break;
                    case RegisterResult.InvalidEmail:
                        setError("Недопустимый e-mail!");
                        break;
                    case RegisterResult.InvalidPassword:
                        setError("Слишком простой или недопустимый пароль!");
                        break;
                    case RegisterResult.LoginAlreadyTaken:
                        setError("Данный логин уже занят!");
                        break;
                    case RegisterResult.EmailAlreadyTaken:
                        setError("Данный e-mail уже зарегистрирован!");
                        break;
                    case RegisterResult.CodeAlreadySend:
                        setError("Код уже отправлен на вашу почту!");
                        registerStep = 2;
                        break;
                    case RegisterResult.TooManyRegistrations:
                        setError("Превышен лимит регистраций!");
                        break;
                    default:
                        setError(res.message || "Ошибка при регистрации!");
                        break;
                }
            }
        } catch (e) {
            setError(e.message || "Произошла ошибка при отправке запроса");
        } finally {
            isLoading = false;
        }
    }

    async function handleVerifyCode() {
        if (!codeVal) {
            setError("Введите код подтверждения!");
            return;
        }

        isLoading = true;
        lastError = null;

        try {
            const res = await anixApi.auth.signUpVerify({
                email: emailVal,
                login: loginVal,
                password: passwordVal,
                hash: registerHash,
                code: codeVal,
            });

            if (res.code === DefaultResult.Ok || res.code === 0) {
                user.set(
                    JSON.stringify({
                        id: res.profile.id,
                        token: res.profileToken.token,
                    }),
                );
                location.reload();
                if (window.analytics) analytics.trackEvent("new_register");
            } else {
                switch (res.code) {
                    case RegisterVerifyResult.InvalidHash:
                        setError("Недействительный запрос. Попробуйте снова.");
                        registerStep = 1;
                        break;
                    default:
                        setError(res.message || "Неверный код подтверждения!");
                        break;
                }
            }
        } catch (e) {
            setError(e.message || "Ошибка при верификации кода");
        } finally {
            isLoading = false;
        }
    }
</script>

<MetaInfo subTitle={activeTab === "login" ? "Вход" : "Регистрация"} />

<div class="login-page">
    {#if lastError}
        <div
            class="login-error"
            in:fade={{ duration: 200 }}
            out:fade={{ duration: 300 }}
        >
            {lastError}
        </div>
    {/if}

    <div class="tabs-container">
        <button
            class="tab-btn"
            class:active={activeTab === "login"}
            onclick={() => {
                activeTab = "login";
                lastError = null;
            }}
        >
            Вход
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === "register"}
            onclick={() => {
                activeTab = "register";
                lastError = null;
            }}
        >
            Регистрация
        </button>
    </div>

    <div class="login-form">
        {#if activeTab === "login"}
            <div class="login-form-title">С возвращением</div>
            <div class="login-form-input">
                <div class="login-form-input-label">Логин / E-mail</div>
                <input type="text" bind:value={loginVal} placeholder="Логин" />
            </div>
            <div class="login-form-input">
                <div class="login-form-input-label">Пароль</div>
                <input type="password" bind:value={passwordVal} placeholder="Пароль" />
            </div>
            <div class="login-form-button">
                <BaseMainButton
                    style="primary"
                    width="100%"
                    borderRadius={6}
                    height={36}
                    isLoading={isLoading}
                    onClickCallback={async () => await login()}
                >
                    Войти
                </BaseMainButton>
            </div>
        {:else if registerStep === 1}
            <div class="login-form-title">Создание аккаунта</div>
            <div class="login-form-input">
                <div class="login-form-input-label">E-mail</div>
                <input type="text" bind:value={emailVal} placeholder="example@mail.ru" />
            </div>
            <div class="login-form-input">
                <div class="login-form-input-label">Логин</div>
                <input type="text" bind:value={loginVal} placeholder="Придумайте логин" />
            </div>
            <div class="login-form-input">
                <div class="login-form-input-label">Пароль</div>
                <input type="password" bind:value={passwordVal} placeholder="Придумайте пароль" />
            </div>
            <div class="login-form-input">
                <div class="login-form-input-label">Подтверждение пароля</div>
                <input type="password" bind:value={confirmPasswordVal} placeholder="Повторите пароль" />
            </div>
            <div class="login-form-button">
                <BaseMainButton
                    style="primary"
                    width="100%"
                    borderRadius={6}
                    height={36}
                    isLoading={isLoading}
                    onClickCallback={async () => await handleSignUp()}
                >
                    Зарегистрироваться
                </BaseMainButton>
            </div>
        {:else if registerStep === 2}
            <div class="login-form-title">Подтверждение почты</div>
            <div class="login-form-subtitle">Код отправлен на {emailVal}</div>
            <div class="login-form-input">
                <div class="login-form-input-label">Код из письма</div>
                <input type="text" bind:value={codeVal} placeholder="Введите код" />
            </div>
            <div class="login-form-button flex-column" style="gap: 8px;">
                <BaseMainButton
                    style="primary"
                    width="100%"
                    borderRadius={6}
                    height={36}
                    isLoading={isLoading}
                    onClickCallback={async () => await handleVerifyCode()}
                >
                    Подтвердить
                </BaseMainButton>
                <button
                    class="back-btn"
                    onclick={() => {
                        registerStep = 1;
                        lastError = null;
                    }}
                >
                    Назад
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .login-page {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .tabs-container {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        background-color: var(--alt-background-color);
        padding: 4px;
        border-radius: 8px;
    }

    .tab-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        font-size: 15px;
        font-weight: 600;
        padding: 8px 24px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .tab-btn.active {
        background-color: var(--main-color, #e50914);
        color: #fff;
    }

    .login-form {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 340px;
        border-radius: 10px;
        padding: 20px;
        background-color: var(--alt-background-color);
    }

    .login-error {
        position: absolute;
        top: 50px;
        margin-bottom: 10px;
        width: 340px;
        background-color: var(--danger-color);
        color: var(--main-text-color);
        text-align: center;
        padding: 10px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10;
    }

    .login-form-input {
        display: flex;
        flex-direction: column;
        margin-top: 8px;
        margin-bottom: 8px;
        width: 100%;
    }

    .login-form-input-label {
        font-size: 14px;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
    }

    .login-form-input input[type="text"],
    .login-form-input input[type="password"] {
        width: 100%;
        height: 38px;
        border-radius: 6px;
        border: 1px solid var(--rate-back-color);
        background-color: var(--background-color);
        color: var(--main-text-color);
        padding: 0 12px;
        box-sizing: border-box;
        font-size: 14px;
        outline: none;
    }

    .login-form-input input:focus {
        border-color: var(--main-color);
    }

    .login-form-title {
        font-size: 22px;
        font-weight: bold;
        margin-bottom: 8px;
    }

    .login-form-subtitle {
        font-size: 13px;
        color: var(--secondary-text-color);
        margin-bottom: 12px;
        text-align: center;
    }

    .login-form-button {
        margin-top: 14px;
        width: 100%;
    }

    .back-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        font-size: 13px;
        cursor: pointer;
        padding: 6px;
    }

    .back-btn:hover {
        color: var(--main-text-color);
    }
</style>

