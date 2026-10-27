package com.lipari.bank.movement;

import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.lipari.bank.account.Account;
import com.lipari.bank.account.AccountRepository;
import com.lipari.bank.movement.dto.TransferRequest;
import com.lipari.bank.movement.dto.TransferResponse;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MovementService {

    private final AccountRepository accountRepo;
    private final MovementRepository movementRepo;

    /**
     * Trasferimento fra due conti, in transazione locale: addebita il conto di
     * partenza, accredita quello di arrivo e registra i due movimenti.
     */
    @Transactional
    public TransferResponse transfer(TransferRequest req) {
        if (req.getFromAccountId().equals(req.getToAccountId())) {
            throw new IllegalArgumentException("fromAccountId and toAccountId must differ");
        }

        Account from = accountRepo.findById(req.getFromAccountId())
                .orElseThrow(() -> new IllegalArgumentException("source account not found"));
        Account to = accountRepo.findById(req.getToAccountId())
                .orElseThrow(() -> new IllegalArgumentException("target account not found"));

        if (from.getBalance().compareTo(req.getAmount()) < 0) {
            throw new IllegalArgumentException("insufficient funds");
        }

        from.setBalance(from.getBalance().subtract(req.getAmount()));
        to.setBalance(to.getBalance().add(req.getAmount()));
        accountRepo.save(from);
        accountRepo.save(to);

        Movement out = new Movement();
        out.setAccountId(from.getId());
        out.setType("TRANSFER_OUT");
        out.setAmount(req.getAmount());
        out.setCounterpartyAccountId(to.getId());
        out.setDescription(req.getDescription());
        out.setExecutedAt(Instant.now());
        movementRepo.save(out);

        Movement in = new Movement();
        in.setAccountId(to.getId());
        in.setType("TRANSFER_IN");
        in.setAmount(req.getAmount());
        in.setCounterpartyAccountId(from.getId());
        in.setDescription(req.getDescription());
        in.setExecutedAt(Instant.now());
        movementRepo.save(in);

        return new TransferResponse(out.getId(), from.getBalance(), to.getBalance(), "COMPLETED");
    }
}
