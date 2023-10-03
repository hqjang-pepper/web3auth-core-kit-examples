import { useEffect, useState } from "react";
import {
  Web3AuthMPCCoreKit,
  WEB3AUTH_NETWORK,
  Point,
  SubVerifierDetailsParams,
  TssShareType,
  keyToMnemonic,
  getWebBrowserFactor,
  COREKIT_STATUS,
  TssSecurityQuestion,
  generateFactorKey,
  mnemonicToKey,
  FactorKeyTypeShareDescription,
} from "@web3auth/mpc-core-kit";

import swal from "sweetalert";
import Web3 from "web3";
import type { provider } from "web3-core";

import { generatePrivate } from "eccrypto";
import "./App.css";
import { CustomFactorsModuleType } from "./constants";
import AuthenticatorService from "./authenticatorService";
import SmsPasswordless from "./smsService";

import { SafeEventEmitterProvider } from "@web3auth/base";
import { BN } from "bn.js";

const uiConsole = (...args: any[]): void => {
  const el = document.querySelector("#console>p");
  if (el) {
    el.innerHTML = JSON.stringify(args || {}, null, 2);
  }
  console.log(...args);
};

const selectedNetwork = WEB3AUTH_NETWORK.MAINNET;

const coreKitInstance = new Web3AuthMPCCoreKit({
  web3AuthClientId: "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ",
  web3AuthNetwork: selectedNetwork,
  uxMode: "redirect",
});

function App() {
  const [backupFactorKey, setBackupFactorKey] = useState<string | undefined>(undefined);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [web3, setWeb3] = useState<any>(undefined);
  const [exportTssShareType, setExportTssShareType] = useState<TssShareType>(TssShareType.DEVICE);
  const [factorPubToDelete, setFactorPubToDelete] = useState<string>("");
  const [coreKitStatus, setCoreKitStatus] = useState<COREKIT_STATUS>(COREKIT_STATUS.NOT_INITIALIZED);
  const [showBackupPhraseScreen, setShowBackupPhraseScreen] = useState<boolean>(false);
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  const [newAnswer, setNewAnswer] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState<string | undefined>(undefined);
  const [newQuestion, setNewQuestion] = useState<string | undefined>(undefined);
  const [number, setNumber] = useState<string>("");

  const securityQuestion: TssSecurityQuestion = new TssSecurityQuestion();

  useEffect(() => {
    const init = async () => {
      await coreKitInstance.init();

      if (coreKitInstance.provider) {
        setProvider(coreKitInstance.provider);
      }

      if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
        uiConsole(
          "required more shares, please enter your backup/ device factor key, or reset account unrecoverable once reset, please use it with caution]"
        );
      }

      setCoreKitStatus(coreKitInstance.status);

      try {
        let result = securityQuestion.getQuestion(coreKitInstance!);
        setQuestion(result);
      } catch (e) {
        setQuestion(undefined);
        uiConsole(e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (provider) {
      const web3 = new Web3(provider as provider);
      setWeb3(web3);
    }
  }, [provider]);

  const keyDetails = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    uiConsole(coreKitInstance.getKeyDetails());
  };

  const listFactors = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    const factorPubs = coreKitInstance.tKey.metadata.factorPubs;
    if (!factorPubs) {
      throw new Error("factorPubs not found");
    }
    const pubsHex = factorPubs[coreKitInstance.tKey.tssTag].map((pub: any) => {
      return Point.fromTkeyPoint(pub).toBufferSEC1(true).toString("hex");
    });
    uiConsole(pubsHex);
  };

  const login = async () => {
    try {
      // Triggering Login using Service Provider ==> opens the popup
      if (!coreKitInstance) {
        throw new Error("initiated to login");
      }
      const verifierConfig = {
        subVerifierDetails: {
          typeOfLogin: "google",
          verifier: "w3a-google-demo",
          clientId: "519228911939-cri01h55lsjbsia1k7ll6qpalrus75ps.apps.googleusercontent.com",
        },
      } as SubVerifierDetailsParams;

      await coreKitInstance.loginWithOauth(verifierConfig);
      setCoreKitStatus(coreKitInstance.status);
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const getDeviceShare = async () => {
    const factorKey = await getWebBrowserFactor(coreKitInstance!);
    setBackupFactorKey(factorKey);
    uiConsole("Device share: ", factorKey);
  };

  const inputBackupFactorKey = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!backupFactorKey) {
      throw new Error("backupFactorKey not found");
    }
    const factorKey = new BN(backupFactorKey, "hex");
    await coreKitInstance.inputFactorKey(factorKey);

    if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
      uiConsole(
        "required more shares even after inputing backup factor key, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"
      );
    }

    if (coreKitInstance.provider) {
      setProvider(coreKitInstance.provider);
    }
  };

  const recoverSecurityQuestionFactor = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!answer) {
      throw new Error("backupFactorKey not found");
    }

    let factorKey = await securityQuestion.recoverFactor(coreKitInstance, answer);
    setBackupFactorKey(factorKey);
    uiConsole("Security Question share: ", factorKey);
  };

  const logout = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    await coreKitInstance.logout();
    uiConsole("Log out");
    setProvider(null);
  };

  const getUserInfo = (): void => {
    const user = coreKitInstance?.getUserInfo();
    uiConsole(user);
  };

  const exportFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    uiConsole("export share type: ", exportTssShareType);
    const factorKey = generateFactorKey();
    await coreKitInstance.createFactor({
      shareType: exportTssShareType,
      factorKey: factorKey.private,
    });
    let mnemonic = keyToMnemonic(factorKey.private.toString("hex"));
    let key = mnemonicToKey(mnemonic);

    uiConsole("Export factor key: ", factorKey);
    console.log("menmonic : ", mnemonic);
    console.log("key: ", key);
  };

  const deleteFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const pubBuffer = Buffer.from(factorPubToDelete, "hex");
    const pub = Point.fromBufferSEC1(pubBuffer);
    await coreKitInstance.deleteFactor(pub.toTkeyPoint());
    uiConsole("factor deleted");
  };

  const setupSmsRecovery = async (): Promise<void> => {
    try {
      if (!coreKitInstance) {
        throw new Error("coreKitInstance is not set");
      }
      if (!coreKitInstance.tKey.privKey) {
        throw new Error("user is not logged in, tkey is not reconstructed yet.");
      }

      const { privKey } = coreKitInstance.tKey;
      // check if we are setting up the sms recovery for the first time.
      // share descriptions contain the details of all the factors/ shares you set up for the user.
      const shareDescriptions = Object.values(coreKitInstance.getKeyDetails().shareDescriptions).map((i) => ((i || [])[0] ? JSON.parse(i[0]) : {}));
      // for sms otp, we have set up a custom share/ factor with module type as "mobile_sms" defined in CustomFactorsModuleType.MOBILE_SMS in this example.
      const shareDescriptionsMobile = shareDescriptions.find((shareDescription) => shareDescription.module === CustomFactorsModuleType.MOBILE_SMS);
      if (shareDescriptionsMobile) {
        console.log("sms recovery already setup");
        uiConsole("sms console already setup");
        return;
      }

      const result = await SmsPasswordless.registerSmsOTP(privKey, number);
      uiConsole("please use this code to verify your phone number", result);
      console.log("otp code", result);

      const verificationCode = await swal("Enter your backup share, please enter the correct code first time :)", {
        content: "input" as any,
      }).then((value) => {
        return value;
      });

      if (!verificationCode || verificationCode.length !== 6) {
        console.error("Invalid verification code entered");
        uiConsole("Invalid verification code entered");
      }
      const { metadataPubKey } = coreKitInstance.getKeyDetails();
      const address = `${metadataPubKey.x.toString(16, 64)}${metadataPubKey.y.toString(16, 64)}`;
      const newBackUpFactorKey = new BN(generatePrivate());
      await SmsPasswordless.addSmsRecovery(address, verificationCode, newBackUpFactorKey);

      // setup the sms recovery factor key and share in tkey.
      // for sms otp, we have set up a custom share/ factor with module type as "mobile_sms" defined in CustomFactorsModuleType.MOBILE_SMS in this example.
      await coreKitInstance.enableMFA({ factorKey: newBackUpFactorKey, shareDescription: FactorKeyTypeShareDescription.Other });
      uiConsole("sms recovery setup complete");
    } catch (error: unknown) {
      console.error(error);
      uiConsole((error as Error).message);
    }
  };

  const recoverViaNumber = async (): Promise<void> => {
    try {
      if (!coreKitInstance) {
        throw new Error("coreKitInstance is not set");
      }

      const keyDetails = coreKitInstance.getKeyDetails();
      if (!keyDetails) {
        throw new Error("keyDetails is not set");
      }

      // check if we are setting up the sms recovery for the first time.
      // share descriptions contain the details of all the factors/ shares you set up for the user.
      const shareDescriptions = Object.values(keyDetails.shareDescriptions).map((i) => ((i || [])[0] ? JSON.parse(i[0]) : {}));
      uiConsole(shareDescriptions);

      // for sms otp, we have set up a custom share/ factor with module type as "mobile_sms" defined in CustomFactorsModuleType.MOBILE_SMS in this example.
      const shareDescriptionsMobile = shareDescriptions.find((shareDescription) => shareDescription.module === CustomFactorsModuleType.MOBILE_SMS);
      if (!shareDescriptionsMobile) {
        console.error("sms recovery not setup");
        uiConsole("sms recovery not setup");
      }

      console.log("sms recovery already setup", shareDescriptionsMobile);

      const { number } = shareDescriptionsMobile;
      const { metadataPubKey } = keyDetails;
      const address = `${metadataPubKey.x.toString(16, 64)}${metadataPubKey.y.toString(16, 64)}`;
      const result = await SmsPasswordless.requestSMSOTP(address);
      uiConsole("please use this code to verify your phone number", number, "code", result);
      console.log("otp code", result);

      const verificationCode = await swal("Enter your backup share, please enter the correct code first time :)", {
        content: "input" as any,
      }).then((value) => {
        return value;
      });

      if (!verificationCode || verificationCode.length !== 6) {
        console.error("Invalid verification code entered");
        uiConsole("Invalid verification code entered");
      }

      const backupFactorKey = await SmsPasswordless.verifySMSOTPRecovery(address, verificationCode);
      if (!backupFactorKey) {
        throw new Error("Invalid verification code entered");
      }
      await coreKitInstance.inputFactorKey(backupFactorKey);
      if (coreKitInstance.provider) setProvider(coreKitInstance.provider);
    } catch (error: unknown) {
      console.error(error);
      uiConsole((error as Error).message);
    }
  };

  const setupAuthenticatorRecovery = async (): Promise<void> => {
    try {
      if (!coreKitInstance) {
        throw new Error("coreKitInstance is not set");
      }
      if (!coreKitInstance.tKey.privKey) {
        throw new Error("user is not logged in, tkey is not reconstructed yet.");
      }

      // get the tkey address
      const { privKey } = coreKitInstance.tKey;

      // check if we are setting up the sms recovery for the first time.
      // share descriptions contain the details of all the factors/ shares you set up for the user.
      const shareDescriptions = Object.values(coreKitInstance.getKeyDetails().shareDescriptions).map((i) => ((i || [])[0] ? JSON.parse(i[0]) : {}));
      uiConsole(shareDescriptions);

      // for authenticator, we have set up a custom share/ factor with module type as "authenticator" defined in CustomFactorsModuleType.AUTHENTICATOR in this example.
      const shareDescriptionsMobile = shareDescriptions.find((shareDescription) => shareDescription.module === CustomFactorsModuleType.AUTHENTICATOR);
      if (shareDescriptionsMobile) {
        console.log("authenticator recovery already setup");
        uiConsole("authenticator recovery already setup");
        return;
      }

      const secretKey = AuthenticatorService.generateSecretKey();
      await AuthenticatorService.register(privKey, secretKey);
      uiConsole("please use this secret key to enter any authenticator app like google", secretKey);
      console.log("secret key", secretKey);

      const verificationCode = await swal(
        `Enter your authenticator code for this secret key: ${secretKey}, please enter the correct code first time :)`,
        {
          content: "input" as any,
        }
      ).then((value) => {
        return value;
      });

      if (!verificationCode) {
        console.error("Invalid verification code entered");
        uiConsole("Invalid verification code entered");
      }
      const { metadataPubKey } = coreKitInstance.getKeyDetails();
      const address = `${metadataPubKey.x.toString(16, 64)}${metadataPubKey.y.toString(16, 64)}`;
      const newBackUpFactorKey = new BN(generatePrivate());
      await AuthenticatorService.addAuthenticatorRecovery(address, verificationCode, newBackUpFactorKey);

      // setup the authenticator recovery factor key and share in tkey.
      // for authenticator, we have set up a custom share/ factor with module type as "authenticator" defined in CustomFactorsModuleType.AUTHENTICATOR in this example.
      // for security reasons, we do not store the secret key in tkey.
      await coreKitInstance.enableMFA({ factorKey: newBackUpFactorKey });
      uiConsole("authenticator recovery setup complete");
    } catch (error: unknown) {
      console.error(error);
      uiConsole((error as Error).message);
    }
  };

  const recoverViaAuthenticatorApp = async (): Promise<void> => {
    try {
      if (!coreKitInstance) {
        throw new Error("coreKitInstance is not set");
      }

      const keyDetails = coreKitInstance.getKeyDetails();
      if (!keyDetails) {
        throw new Error("keyDetails is not set");
      }

      // check if we are setting up the sms recovery for the first time.
      // share descriptions contain the details of all the factors/ shares you set up for the user.
      const shareDescriptions = Object.values(keyDetails.shareDescriptions).map((i) => ((i || [])[0] ? JSON.parse(i[0]) : {}));
      // for authenticator, we have set up a custom share/ factor with module type as "authenticator" defined in CustomFactorsModuleType.AUTHENTICATOR in this example.
      const shareDescriptionsMobile = shareDescriptions.find((shareDescription) => shareDescription.module === CustomFactorsModuleType.AUTHENTICATOR);
      if (!shareDescriptionsMobile) {
        console.error("authenticator recovery not setup");
        uiConsole("authenticator recovery not setup");
      }

      console.log("authenticator recovery already setup", shareDescriptionsMobile);

      const { metadataPubKey } = keyDetails;
      const address = `${metadataPubKey.x.toString(16, 64)}${metadataPubKey.y.toString(16, 64)}`;

      const verificationCode = await swal("Enter your authenticator code, please enter the correct code first time :)", {
        content: "input" as any,
      }).then((value) => {
        return value;
      });

      if (!verificationCode) {
        console.error("Invalid verification code entered");
        uiConsole("Invalid verification code entered");
      }

      const backupFactorKey = await AuthenticatorService.verifyAuthenticatorRecovery(address, verificationCode);
      if (!backupFactorKey) {
        throw new Error("Invalid verification code entered");
      }
      await coreKitInstance.inputFactorKey(backupFactorKey);
      if (coreKitInstance.provider) setProvider(coreKitInstance.provider);
    } catch (error: unknown) {
      console.error(error);
      uiConsole((error as Error).message);
    }
  };

  const getChainID = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const chainId = await web3.eth.getChainId();
    uiConsole(chainId);
    return chainId;
  };

  const getAccounts = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const address = (await web3.eth.getAccounts())[0];
    uiConsole(address);
    return address;
  };

  const getBalance = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const address = (await web3.eth.getAccounts())[0];
    const balance = web3.utils.fromWei(
      await web3.eth.getBalance(address) // Balance is in wei
    );
    uiConsole(balance);
    return balance;
  };

  const signMessage = async (): Promise<any> => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const fromAddress = (await web3.eth.getAccounts())[0];
    const originalMessage = [
      {
        type: "string",
        name: "fullName",
        value: "Satoshi Nakamoto",
      },
      {
        type: "uint32",
        name: "userId",
        value: "1212",
      },
    ];
    const params = [originalMessage, fromAddress];
    const method = "eth_signTypedData";
    const signedMessage = await (web3.currentProvider as any)?.sendAsync({
      id: 1,
      method,
      params,
      fromAddress,
    });
    uiConsole(signedMessage);
  };

  const criticalResetAccount = async (): Promise<void> => {
    // This is a critical function that should only be used for testing purposes
    // Resetting your account means clearing all the metadata associated with it from the metadata server
    // The key details will be deleted from our server and you will not be able to recover your account
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    //@ts-ignore
    // if (selectedNetwork === WEB3AUTH_NETWORK.MAINNET) {
    //   throw new Error("reset account is not recommended on mainnet");
    // }
    await coreKitInstance.tKey.storageLayer.setMetadata({
      privKey: new BN(coreKitInstance.metadataKey!, "hex"),
      input: { message: "KEY_NOT_FOUND" },
    });
    uiConsole("reset");
    setProvider(null);
  };

  const sendTransaction = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const fromAddress = (await web3.eth.getAccounts())[0];

    const destination = "0x2E464670992574A613f10F7682D5057fB507Cc21";
    const amount = web3.utils.toWei("0.0001"); // Convert 1 ether to wei

    // Submit transaction to the blockchain and wait for it to be mined
    uiConsole("Sending transaction...");
    const receipt = await web3.eth.sendTransaction({
      from: fromAddress,
      to: destination,
      value: amount,
    });
    uiConsole(receipt);
  };

  const createSecurityQuestion = async (question: string, answer: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.setSecurityQuestion({ mpcCoreKit: coreKitInstance, question, answer, shareType: TssShareType.RECOVERY });
    setNewQuestion(undefined);
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
  };

  const changeSecurityQuestion = async (newQuestion: string, newAnswer: string, answer: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.changeSecurityQuestion({ mpcCoreKit: coreKitInstance, newQuestion, newAnswer, answer });
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
  };

  const deleteSecurityQuestion = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.deleteSecurityQuestion(coreKitInstance);
    setQuestion(undefined);
  };

  const enableMFA = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const factorKey = await coreKitInstance.enableMFA({});
    const factorKeyMnemonic = await keyToMnemonic(factorKey);

    uiConsole("MFA enabled, device factor stored in local store, deleted hashed cloud key, your backup factor key: ", factorKeyMnemonic);
  };

  const loggedInView = (
    <>
      <h2 className="subtitle">Account Details</h2>
      <div className="flex-container">
        <button onClick={getUserInfo} className="card">
          Get User Info
        </button>

        <button onClick={async () => uiConsole(await coreKitInstance.getTssPublicKey())} className="card">
          Get Public Key
        </button>

        <button onClick={keyDetails} className="card">
          Key Details
        </button>

        <button onClick={listFactors} className="card">
          List Factors
        </button>
      </div>
      <div className="flex-container">
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>

        <button onClick={async () => uiConsole(await coreKitInstance._UNSAFE_exportTssKey())} className="card">
          [CAUTION] Export TSS Private Key
        </button>

        <button onClick={logout} className="card">
          Log Out
        </button>
      </div>
      <h2 className="subtitle">Recovery/ Key Manipulation</h2>
      <div>
        <h4>Enabling MFA</h4>
        <div className="flex-container">
          <button onClick={enableMFA} className="card">
            Enable MFA
          </button>
        </div>
        <h4>Manual Factors Manipulation</h4>
        <div className="flex-container">
          <label>Share Type:</label>
          <select value={exportTssShareType} onChange={(e) => setExportTssShareType(parseInt(e.target.value))}>
            <option value={TssShareType.DEVICE}>Device Share</option>
            <option value={TssShareType.RECOVERY}>Recovery Share</option>
          </select>
          <button onClick={exportFactor} className="card">
            Export share
          </button>
        </div>
        <div className="flex-container">
          <label>Factor pub:</label>
          <input value={factorPubToDelete} onChange={(e) => setFactorPubToDelete(e.target.value)}></input>
          <button onClick={deleteFactor} className="card">
            Delete Factor
          </button>
        </div>
        <div className="flex-container">
          <input value={backupFactorKey} onChange={(e) => setBackupFactorKey(e.target.value)}></input>
          <button onClick={() => inputBackupFactorKey()} className="card">
            Input Factor Key
          </button>
        </div>

        <h4>SMS OTP</h4>
        <div className="flex-container">
          <input placeholder={"Enter number +{cc}-{number}"} value={number} onChange={(e) => setNumber(e.target.value)}></input>
          <button onClick={setupSmsRecovery} className="card">
            Setup SMS Recovery
          </button>
        </div>

        <h4>Authenticator</h4>
        <div className="flex-container">
          <button onClick={setupAuthenticatorRecovery} className="card">
            Setup Authenticator
          </button>
        </div>

        <h4>Security Question</h4>

        <div>{question}</div>
        <div className="flex-container">
          <div className={question ? " disabledDiv" : ""}>
            <label>Set Security Question:</label>
            <input value={question} placeholder="question" onChange={(e) => setNewQuestion(e.target.value)}></input>
            <input value={answer} placeholder="answer" onChange={(e) => setAnswer(e.target.value)}></input>
            <button onClick={() => createSecurityQuestion(newQuestion!, answer!)} className="card">
              Create Security Question
            </button>
          </div>

          <div className={!question ? " disabledDiv" : ""}>
            <label>Change Security Question:</label>
            <input value={newQuestion} placeholder="newQuestion" onChange={(e) => setNewQuestion(e.target.value)}></input>
            <input value={newAnswer} placeholder="newAnswer" onChange={(e) => setNewAnswer(e.target.value)}></input>
            <input value={answer} placeholder="oldAnswer" onChange={(e) => setAnswer(e.target.value)}></input>
            <button onClick={() => changeSecurityQuestion(newQuestion!, newAnswer!, answer!)} className="card">
              Change Security Question
            </button>
          </div>
        </div>
        <div className="flex-container">
          <div className={!question ? "disabledDiv" : ""}>
            <button onClick={() => deleteSecurityQuestion()} className="card">
              Delete Security Question
            </button>
          </div>
        </div>
      </div>
      <h2 className="subtitle">Blockchain Calls</h2>
      <div className="flex-container">
        <button onClick={getChainID} className="card">
          Get Chain ID
        </button>

        <button onClick={getAccounts} className="card">
          Get Accounts
        </button>

        <button onClick={getBalance} className="card">
          Get Balance
        </button>

        <button onClick={signMessage} className="card">
          Sign Message
        </button>

        <button onClick={sendTransaction} className="card">
          Send Transaction
        </button>
      </div>
    </>
  );

  const unloggedInView = (
    <>
      <button onClick={() => login()} className="card">
        Login
      </button>
      <div className={coreKitStatus === COREKIT_STATUS.REQUIRED_SHARE ? "" : "disabledDiv"}>
        <button onClick={() => getDeviceShare()} className="card">
          Get Device Share
        </button>
        <label>Backup/ Device factor key:</label>
        <input value={backupFactorKey} onChange={(e) => setBackupFactorKey(e.target.value)}></input>
        <button onClick={() => inputBackupFactorKey()} className="card">
          Input Factor Key
        </button>
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>
        <button onClick={recoverViaNumber} className="card">
          Recover using phone number
        </button>
        <button onClick={recoverViaAuthenticatorApp} className="card">
          Recover using Authenticator
        </button>
        <div className={!question ? "disabledDiv" : ""}>
          <label>Recover Using Security Answer:</label>
          <label>{question}</label>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)}></input>
          <button onClick={() => recoverSecurityQuestionFactor()} className="card">
            Recover Using Security Answer
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="container">
      <h1 className="title">
        <a target="_blank" href="https://web3auth.io/docs/guides/mpc" rel="noreferrer">
          Web3Auth MPC Core Kit
        </a>{" "}
        Redirect Flow Example
      </h1>

      <div className="grid">{provider ? loggedInView : unloggedInView}</div>
      <div id="console" style={{ whiteSpace: "pre-line" }}>
        <p style={{ whiteSpace: "pre-line" }}></p>
      </div>

      <footer className="footer">
        <a
          href="https://github.com/Web3Auth/web3auth-core-kit-examples/tree/main/mpc-core-kit/mpc-core-kit-react-redirect-example"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
      </footer>
    </div>
  );
}

export default App;
