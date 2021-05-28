pragma solidity >=0.6.0;

import "../utils/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EncryptedSale is Ownable {

  using SafeMath for uint256;

  struct Dialogue {
      uint256 dialogueId;
      address author;

      string encryptedMessage;
  }

  struct Sale {
    uint256 saleId;

    address buyer;
    address seller;

    uint256 price; // in usd (1 = $0.000001)

    Dialogue[] dialogue;

    string buyerPublicKey;
    string sellerPublicKey;

    string encryptedData;
  }

  mapping(uint256 => Sale) public sales;

  constructor() public {}

}
