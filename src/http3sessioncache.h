// modifications
// Copyright (c) 2022 Marten Richter or other contributers (see commit). All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// original copyright, see LICENSE.chromium
// Copyright (c) 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


#ifndef HTTP3_SESSION_CACHE_H
#define HTTP3_SESSION_CACHE_H

#include <memory>

#include "quiche/quic/core/crypto/quic_crypto_client_config.h"
#include "quiche/quic/core/crypto/transport_parameters.h"

namespace quic {

// Http3SessionCache provides a simple implementation of SessionCache that
// stores only one QuicResumptionState per QuicServerId. No limit is placed on
// the total number of entries in the cache. When Lookup is called, if a cache
// entry exists for the provided QuicServerId, the entry will be removed from
// the cached when it is returned.
// TODO(fayang): Remove Http3SessionCache by using QuicClientSessionCache.
class Http3SessionCache : public SessionCache {
 public:
  Http3SessionCache() = default;
  ~Http3SessionCache() override = default;

  void Insert(const QuicServerId& server_id,
              bssl::UniquePtr<SSL_SESSION> session,
              const TransportParameters& params,
              const ApplicationState* application_state) override;
  std::unique_ptr<QuicResumptionState> Lookup(const QuicServerId& server_id,
                                              QuicWallTime now,
                                              const SSL_CTX* ctx) override;
  void ClearEarlyData(const QuicServerId& server_id) override;
  void OnNewTokenReceived(const QuicServerId& server_id,
                          absl::string_view token) override;
  void RemoveExpiredEntries(QuicWallTime now) override;
  void Clear() override;

 private:
  struct Entry {
    bssl::UniquePtr<SSL_SESSION> session;
    std::unique_ptr<TransportParameters> params;
    std::unique_ptr<ApplicationState> application_state;
    std::string token;
  };
  std::map<QuicServerId, Entry> cache_entries_;
};


}  // namespace quic

#endif  // QUICHE_QUIC_TEST_TOOLS_SIMPLE_SESSION_CACHE_H_