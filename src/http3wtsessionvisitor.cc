// Copyright (c) 2022 Marten Richter or other contributers (see commit). All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/http3wtsessionvisitor.h"
#include "src/http3eventloop.h"

namespace quic
{

    void Http3WTSession::Visitor::OnSessionClosed(WebTransportSessionError error_code,
                                                const std::string &error_message)
    {

        session_->eventloop_->informSessionClosed(session_, error_code, error_message);
    }

    void Http3WTSession::Visitor::OnSessionReady(const spdy::SpdyHeaderBlock &)
    {
        session_->eventloop_->informSessionReady(session_);

        if (session_->session_->CanOpenNextOutgoingBidirectionalStream())
        {
            OnCanCreateNewOutgoingBidirectionalStream();
        }
        if (session_->session_->CanOpenNextOutgoingUnidirectionalStream())
        {
            OnCanCreateNewOutgoingUnidirectionalStream();
        }
    }

}