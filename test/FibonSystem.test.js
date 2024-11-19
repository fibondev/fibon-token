const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Fibon Token System", function () {
    let token, ico, vesting, multisig;
    let owner, addr1, addr2, addr3, addr4, addr5;
    let tokenAddress, icoAddress, vestingAddress;
    let startTime, endTime;

    beforeEach(async function () {
        try {
            [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
            console.log("Got signers");

            const FibonMultiSig = await ethers.getContractFactory("FibonMultiSig");
            console.log("Got MultiSig factory");

            const owners = [addr1.address, addr2.address, addr3.address];
            console.log("Owners array:", owners);

            multisig = await FibonMultiSig.deploy(
                owners,
                2
            );
            console.log("MultiSig deployment initiated");

            await multisig.waitForDeployment();
            console.log("MultiSig deployment confirmed");

            const FibonToken = await ethers.getContractFactory("FibonToken");
            token = await FibonToken.deploy(await multisig.getAddress());
            await token.waitForDeployment();
            tokenAddress = await token.getAddress();
            console.log("Token deployed at:", tokenAddress);

            startTime = Math.floor(Date.now() / 1000) + 3600;
            endTime = startTime + (30 * 24 * 3600);

            const FibonICO = await ethers.getContractFactory("FibonICO");
            ico = await FibonICO.deploy(
                tokenAddress,
                10n,
                BigInt(startTime),
                BigInt(endTime),
                ethers.parseEther("1")
            );
            console.log("ICO deployment initiated");

            await ico.waitForDeployment();
            icoAddress = await ico.getAddress();
            console.log("ICO deployed at:", icoAddress);

            const FibonVesting = await ethers.getContractFactory("FibonVesting");
            vesting = await FibonVesting.deploy(
                tokenAddress,
                await multisig.getAddress()
            );
            await vesting.waitForDeployment();
            vestingAddress = await vesting.getAddress();
            console.log("Vesting deployed at:", vestingAddress);

        } catch (error) {
            console.error("Error in beforeEach:", error);
            throw error;
        }
    });

    describe("MultiSig Core Tests", function () {
        it("Should correctly initialize MultiSig", async function () {
            expect(await multisig.owners(0)).to.equal(addr1.address);
            expect(await multisig.owners(1)).to.equal(addr2.address);
            expect(await multisig.owners(2)).to.equal(addr3.address);
            expect(await multisig.required()).to.equal(2n);
        });

        it("Should submit and confirm transaction", async function () {
            const value = ethers.parseEther("1");
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                value,
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await multisig.connect(addr2).confirmTransaction(txId);
            const transaction = await multisig.transactions(txId);
            expect(transaction.confirmations).to.equal(2n);
        });

        it("Should fail if non-owner tries to confirm", async function () {
            const value = ethers.parseEther("1");
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                value,
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await expect(
                multisig.connect(addr4).confirmTransaction(txId)
            ).to.be.revertedWith("Not an owner");
        });
    });

    describe("Token Tests with MultiSig", function () {
        it("Should mint tokens through MultiSig", async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);

            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            expect(await token.balanceOf(icoAddress)).to.equal(mintAmount);
        });

        it("Should burn tokens through MultiSig", async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [addr4.address, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            const burnAmount = ethers.parseEther("500000");
            const burnData = token.interface.encodeFunctionData("burnFrom", [addr4.address, burnAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, burnData);
            await multisig.connect(addr2).confirmTransaction(1);

            expect(await token.balanceOf(addr4.address)).to.equal(mintAmount - burnAmount);
        });
    });

    describe("ICO Tests with MultiSig", function () {
        let nextTxId = 0;

        beforeEach(async function () {
            nextTxId = 0;
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const approveData = token.interface.encodeFunctionData("approve", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, approveData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should allow buying tokens in pre-launch phase", async function () {
            await time.increaseTo(startTime + 1);
            const buyAmount = ethers.parseEther("1");

            await ico.connect(addr4).buyTokens({ value: buyAmount.toString() });

            const preLaunchInfo = await ico.preLaunchSale();
            expect(preLaunchInfo.totalSold).to.equal(buyAmount * 10n);
        });

        it("Should allow emergency stop through MultiSig", async function () {
            const stopData = ico.interface.encodeFunctionData("stop");
            await multisig.connect(addr1).submitTransaction(icoAddress, 0, stopData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                ico.connect(addr4).buyTokens({ value: ethers.parseEther("1").toString() })
            ).to.be.revertedWith("ICO is stopped");
        });
    });

    describe("Vesting Tests with MultiSig", function () {
        let nextTxId = 0;

        beforeEach(async function () {
            nextTxId = 0;

            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            const tx = await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await tx.wait();
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should add vesting type through MultiSig", async function () {
            const phases = [
                {
                    start: 0,
                    end: 30 * 24 * 3600,
                    percentage: 30
                },
                {
                    start: 30 * 24 * 3600,
                    end: 60 * 24 * 3600,
                    percentage: 70
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [1, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const firstPhase = await vesting.vestingTypes(1, 0);
            expect(firstPhase.percentage).to.equal(30);
        });

        it("Should create vesting schedule through MultiSig", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.false;
        });

        it("Should disable vesting schedule through MultiSig", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const disableData = vesting.interface.encodeFunctionData("disableVestingSchedule", [addr4.address]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;
        });
    });

    describe("System Integration Tests", function () {
        it("Should handle complete ICO and Vesting flow", async function () {
            let nextTxId = 0;

            const latestTime = await time.latest();
            await time.increaseTo(latestTime + 3600);

            const icoMintData = token.interface.encodeFunctionData("mint", [icoAddress, ethers.parseEther("1000000")]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, icoMintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const approveData = token.interface.encodeFunctionData("approve", [icoAddress, ethers.parseEther("1000000")]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, approveData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await ico.connect(addr4).buyTokens({ value: ethers.parseEther("1").toString() });

            const balance = await token.balanceOf(addr4.address);
            expect(balance).to.be.gt(0);
        });
    });

    describe("Advanced Vesting Tests", function () {
        let nextTxId = 0;

        beforeEach(async function () {
            nextTxId = 0;

            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should properly calculate vested amounts before disabling", async function () {
            await time.increase(90 * 24 * 3600);

            const [totalVested, totalReleased, releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("1000"),
                ethers.parseEther("1")
            );
        });

        it("Should properly redistribute vested and remaining amounts when disabling", async function () {
            await time.increase(90 * 24 * 3600);

            const [initialVested, , ] = await vesting.getVestedAmount(addr4.address);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;

            const earnedPercentage = initialVested.mul(100).div(ethers.parseEther("10000"));
            const firstPhase = await vesting.vestingSchedules(addr4.address).phases[0];
            expect(firstPhase.percentage).to.be.closeTo(
                earnedPercentage.div(3).add(20),
                1
            );
        });

        it("Should handle time remainder distribution correctly", async function () {
            await time.increase(100 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            const phases = schedule.phases;

            const phaseLengths = phases.map(p => p.end - p.start);
            const maxDiff = Math.max(...phaseLengths) - Math.min(...phaseLengths);
            expect(maxDiff).to.be.lte(2);
        });

        it("Should maintain total percentage at 100% after redistribution", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const phases = await vesting.getSchedulePhases(addr4.address);
            let totalPercentage = 0n;

            for(let i = 0; i < phases.length; i++) {
                totalPercentage += phases[i].percentage;
            }

            expect(totalPercentage).to.equal(100n);
        });

        it("Should not allow re-enabling a disabled schedule", async function () {
            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            let schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;

            const enableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, false]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, enableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;
        });

        it("Should calculate correct vested amounts at different time points", async function () {
            await time.increase(45 * 24 * 3600);
            let [totalVested, , releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("500"),
                ethers.parseEther("1")
            );

            await time.increase(135 * 24 * 3600);
            [totalVested, , releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("2000"),
                ethers.parseEther("1")
            );
        });

        it("Should handle multiple releases correctly", async function () {
            await time.increase(270 * 24 * 3600);

            await vesting.connect(addr4).release();
            const firstReleaseBalance = await token.balanceOf(addr4.address);

            await time.increase(180 * 24 * 3600);

            await vesting.connect(addr4).release();
            const secondReleaseBalance = await token.balanceOf(addr4.address);

            expect(secondReleaseBalance).to.be.gt(firstReleaseBalance);
        });

        it("Should prevent release when no tokens are available", async function () {
            await expect(
                vesting.connect(addr4).release()
            ).to.be.revertedWith("No tokens available for release");
        });

        it("Should handle edge cases in vesting schedule", async function () {
            await time.increase(180 * 24 * 3600);
            const [vestedAtPhase1End, , ] = await vesting.getVestedAmount(addr4.address);

            await time.increase(1);
            const [vestedAfterPhase1, , ] = await vesting.getVestedAmount(addr4.address);

            expect(vestedAfterPhase1).to.be.gt(vestedAtPhase1End);
        });

        it("Should calculate correct vesting percentage", async function () {
            await time.increase(180 * 24 * 3600);
            const percentage = await vesting.getVestedPercentage(addr4.address);
            expect(percentage).to.be.closeTo(2000n, 10n);
        });

        it("Should handle revocation of unvested tokens", async function () {
            await time.increase(90 * 24 * 3600);

            const revokeData = vesting.interface.encodeFunctionData("revokeBeneficiary", [addr4.address]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, revokeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.startTime).to.equal(0);
        });

        it("Should properly handle disabled schedule releases", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                vesting.connect(addr4).release()
            ).to.be.revertedWith("Vesting schedule is disabled");
        });

        it("Should validate phase transitions in disabled schedules", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const phases = await vesting.getSchedulePhases(addr4.address);
            for(let i = 1; i < phases.length; i++) {
                expect(phases[i].start).to.equal(phases[i-1].end);
            }
        });

        it("Should maintain correct token balances throughout vesting", async function () {
            const initialContractBalance = await token.balanceOf(vestingAddress);

            await time.increase(360 * 24 * 3600);
            await vesting.connect(addr4).release();

            const finalContractBalance = await token.balanceOf(vestingAddress);
            const beneficiaryBalance = await token.balanceOf(addr4.address);

            expect(initialContractBalance - finalContractBalance).to.equal(beneficiaryBalance);
        });

        it("Should handle concurrent vesting schedules", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr5.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await time.increase(180 * 24 * 3600);

            const [vested1, , ] = await vesting.getVestedAmount(addr4.address);
            const [vested2, , ] = await vesting.getVestedAmount(addr5.address);

            expect(vested1).to.equal(vested2);
        });

        it("Should properly handle zero vesting periods", async function () {
            const phases = [
                {
                    start: 0,
                    end: 0,
                    percentage: 100
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [10, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr5.address, 10, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const [vested, , ] = await vesting.getVestedAmount(addr5.address);
            expect(vested).to.equal(ethers.parseEther("1000"));
        });
    });
});