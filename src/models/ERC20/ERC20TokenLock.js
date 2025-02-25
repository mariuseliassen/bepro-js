import _ from 'lodash';
import moment from 'moment';
import dayjs from 'dayjs';
import { tokenlock } from '../../interfaces';
import ERC20Contract from './ERC20Contract';
import IContract from '../IContract';
import Numbers from '../../utils/Numbers';

const assert = require('assert');

/**
 * ERC20 Token Lock Contract Object
 * @class ERC20TokenLock
 * @param {Object} params
 * @param {Address} params.tokenAddress
 * @param {Address} params.contractAddress ? (opt)
 */

class ERC20TokenLock extends IContract {
  constructor(params = {}) {
    try {
      super({ ...params, abi: tokenlock });
      console.log(`ERC20TokenLock.ctor.tokenAddress: ${params.tokenAddress}`);
      console.log(
        `ERC20TokenLock.ctor.contractAddress: ${params.contractAddress}`,
      );
      if (params.tokenAddress) {
        this.params.ERC20Contract = new ERC20Contract({
          web3: params.web3,
          contractAddress: params.tokenAddress,
          acc: params.acc,
        });
      } else {
        throw new Error("Please provide an ERC20 Address in 'tokenAddress'");
      }
    } catch (err) {
      throw err;
    }
  }

  /**
   * @function
   * @description Get ERC20 Address of the Token Contract managed
   * @returns {Address}
   */
  async erc20() {
    return await this.params.contract.getContract().methods.erc20().call();
  }

  /**
   * @function
   * @description Get Token Amount of ERC20 Address
   * @param {Object} params
   * @param {Address} params.address
   * @returns {Integer} Token Amount
   */
  getTokenAmount = async ({ address }) => await this.getERC20Contract().getTokenAmount(address);

  /**
   * @function
   * @description Get All Tokens staked/locked at that specific moment
   * @returns {Integer} Token Amount
   */
  async totalAmountStaked() {
    const res = await this.params.contract
      .getContract()
      .methods.totalAmountStaked()
      .call();
    return Numbers.fromDecimals(res, this.getERC20Contract().getDecimals());
  }

  /**
   * @function
   * @description Get minimum amount of tokens to lock per user
   * @returns {Integer} Minimum Amount
   */
  async minAmountToLock() {
    const res = await this.params.contract
      .getContract()
      .methods.minAmountToLock()
      .call();
    return Numbers.fromDecimals(res, this.getERC20Contract().getDecimals());
  }

  /**
   * @function
   * @description Get maximum amount of tokens to lock per user
   * @returns {Integer} Maximum Amount
   */
  async maxAmountToLock() {
    const res = await this.params.contract
      .getContract()
      .methods.maxAmountToLock()
      .call();
    return Numbers.fromDecimals(res, this.getERC20Contract().getDecimals());
  }

  /**
   * @function
   * @description Check if locked tokens release date has come and user can withdraw them
   * @param {Object} params
   * @param {Address} params.address
   * @returns {Boolean} canRelease
   */
  canRelease = async ({ address }) => await this.params.contract.getContract().methods.canRelease(address).call();

  /**
   * @function
   * @description Get locked tokens amount for a given address
   * @param {Object} params
   * @param {Address} params.address
   * @returns {Integer} amount Locked token amount
   */
  getLockedTokens = async ({ address }) => {
    const res = await this.params.contract
      .getContract()
      .methods.getLockedTokens(address)
      .call();
    return Numbers.fromDecimals(res, this.getERC20Contract().getDecimals());
  };

  /**
   * @function
   * @description Get locked tokens info for a given address
   * @param {Object} params
   * @param {Address} params.address
   * @returns {Date} startDate
   * @returns {Date} endDate
   * @returns {Integer} amount Token amount
   */
  getLockedTokensInfo = async ({ address }) => {
    const res = await this.params.contract
      .getContract()
      .methods.getLockedTokensInfo(address)
      .call();

    return {
      startDate: Numbers.fromSmartContractTimeToMinutes(res[0]),
      endDate: Numbers.fromSmartContractTimeToMinutes(res[1]),
      amount: Numbers.fromDecimals(
        res[2],
        this.getERC20Contract().getDecimals(),
      ),
    };
  };

  /**
   * @function
   * @description Admin sets maximum amount of tokens to lock per user
   * @param {Object} params
   * @param {Address} params.tokenAmount Amount of Tokens
   * @returns {Boolean} Success True if operation was successful
   */
  setMaxAmountToLock = async ({ tokenAmount }) => {
    this.onlyOwner(); // verify that user is admin

    /* Get Decimals of Amount */
    const amountWithDecimals = Numbers.toSmartContractDecimals(
      tokenAmount,
      this.getERC20Contract().getDecimals(),
    );

    return await this.__sendTx(
      this.params.contract
        .getContract()
        .methods.setMaxAmountToLock(amountWithDecimals),
    );
  };

  /**
   * @function
   * @description Admin sets minimum amount of tokens to lock per user
   * @param {Object} params
   * @param {Integer} params.tokenAmount Minimum tokens amount
   * @returns {Boolean} Success True if operation was successful
   */
  setMinAmountToLock = async ({ tokenAmount }) => {
    this.onlyOwner(); // verify that user is admin

    /* Get Decimals of Amount */
    const amountWithDecimals = Numbers.toSmartContractDecimals(
      tokenAmount,
      this.getERC20Contract().getDecimals(),
    );

    return await this.__sendTx(
      this.params.contract
        .getContract()
        .methods.setMinAmountToLock(amountWithDecimals),
    );
  };

  /**
   * @function
   * @description User locks his tokens until specified end date.
   * @param {Object} params
   * @param {Address} params.address User Address
   * @param {Integer} params.amount Tokens amount to be locked
   * @param {Date} params.endDate Lock tokens until this end date
   * @returns {Boolean} Success True if operation was successful
   * REQUIREMENTS:
   * user must have approved this contract to spend the tokens "amount" he wants to lock before calling this function.
   */
  lock = async ({ address, amount, endDate }) => {
    // / 'address' is current user address

    this.whenNotPaused(); // verify that contract is not paused

    assert(
      amount > 0
        && amount >= (await this.minAmountToLock())
        && amount <= (await this.maxAmountToLock()),
      'Invalid token amount',
    );
    assert(endDate > moment(), 'Invalid end date');

    // check if user can lock tokens
    const lockedAmount = await this.getLockedTokens({ address });
    assert(lockedAmount == 0, 'User already has locked tokens'); // otherwise user already locked tokens

    /* Verify if transfer is approved for this amount */
    const isApproved = await this.getERC20Contract().isApproved({
      address,
      amount,
      spenderAddress: this.getAddress(),
    });
    if (!isApproved) {
      throw new Error(
        "Has to Approve Token Transfer First, use the 'approve' Call",
      );
    }
    console.log('---lock.bp0');
    return await this.__sendTx(
      this.params.contract
        .getContract()
        .methods.lock(
          Numbers.toSmartContractDecimals(
            amount,
            this.getERC20Contract().getDecimals(),
          ),
          Numbers.timeToSmartContractTime(endDate),
        ),
    );
  };

  /**
   * @function
   * @description User withdraws his locked tokens after specified end date
   * @param {Object} params
   * @param {Address} params.address User Address
   * @return {Boolean} Success True if operation was successful
   */
  release = async ({ address }) => {
    // / 'address' is current user address

    // check if user has locked tokens and if he can unlock and withdraw them
    const { startDate, endDate, amount } = await this.getLockedTokensInfo({
      address,
    });
    const lockedAmount = amount;

    assert(lockedAmount > 0, 'ERC20TokenLock.user has no locked tokens');
    assert(
      moment() >= endDate,
      'ERC20TokenLock.tokens release date not reached',
    );

    return await this.__sendTx(
      this.params.contract.getContract().methods.release(),
    );
  };

  /**
   * @function
   * @description Approve this contract to transfer tokens of the ERC20 token contract on behalf of user
   * @return {Boolean} Success True if operation was successful
   */
  approveERC20Transfer = async () => {
    // let totalMaxAmount = await this.getERC20Contract().getTokenAmount(await this.getUserAddress());
    const totalMaxAmount = await this.getERC20Contract().totalSupply();
    return await this.getERC20Contract().approve({
      address: this.getAddress(),
      amount: Numbers.toSmartContractDecimals(
        totalMaxAmount,
        this.getERC20Contract().getDecimals(),
      ),
    });
  };

  __assert = async () => {
    if (!this.getAddress()) {
      throw new Error(
        'Contract is not deployed, first deploy it and provide a contract address',
      );
    }

    /* Use ABI */
    this.params.contract.use(tokenlock, this.getAddress());

    /* Set Token Address Contract for easy access */
    if (!this.params.ERC20Contract) {
      // console.log('---ERC20TokenLock.__assert.ERC20Contract null, creating new one');
      this.params.ERC20Contract = new ERC20Contract({
        web3: this.web3,
        contractAddress: await this.erc20(),
        acc: this.acc,
      });
    }
    /* Assert Token Contract */
    await this.params.ERC20Contract.__assert();
  };

  /**
   * @function
   * @description Deploy the ERC20 Token Lock Contract
   */
  deploy = async ({ callback } = {}) => {
    if (!this.getERC20Contract()) {
      throw new Error('No Token Address Provided');
    }
    const params = [this.getERC20Contract().getAddress()];

    const res = await this.__deploy(params, callback);
    this.params.contractAddress = res.contractAddress;
    /* Call to Backend API */
    await this.__assert();
    return res;
  };

  getERC20Contract = () => this.params.ERC20Contract;
}

export default ERC20TokenLock;
