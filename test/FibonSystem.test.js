const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Fibon Token System", function () {
    let token, ico, vesting, multisig;
    let owner, addr1, addr2, addr3;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // Deploy MultiSig first
        const FibonMultiSig = await ethers.getContractFactory("FibonMultiSig");
        const owners = [addr1.address, addr2.address, addr3.address];
        multisig = await FibonMultiSig.deploy(owners, 2n);
        await multisig.waitForDeployment();

        // Deploy Token
        const FibonToken = await ethers.getContractFactory("FibonToken");
        token = await FibonToken.deploy(owner.address);
        await token.waitForDeployment();

        // Get token address
        const tokenAddress = await token.getAddress();

        // Deploy ICO with proper parameters
        const startTime = Math.floor(Date.now() / 1000) + 3600;
        const endTime = startTime + (30 * 24 * 3600);
        const FibonICO = await ethers.getContractFactory("FibonICO");
        ico = await FibonICO.deploy(
            tokenAddress,
            1000n, // rate
            BigInt(startTime),
            BigInt(endTime),
            ethers.parseEther("100") // hardcap
        );
        await ico.waitForDeployment();

        // Deploy Vesting
        const FibonVesting = await ethers.getContractFactory("FibonVesting");
        vesting = await FibonVesting.deploy(tokenAddress, owner.address);
        await vesting.waitForDeployment();
    });

    describe("MultiSig Tests", function () {
        it("Should correctly initialize MultiSig", async function () {
            expect(await multisig.owners(0)).to.equal(addr1.address);
            expect(await multisig.owners(1)).to.equal(addr2.address);
            expect(await multisig.owners(2)).to.equal(addr3.address);
            expect(await multisig.required()).to.equal(2n);
        });
    });
}); 